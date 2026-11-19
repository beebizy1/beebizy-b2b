import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { NormalizedHubSpotContact } from "../data/hubspotContacts.ts";
import { NAME_COLUMN_ALIASES } from "../data/registrationNames.ts";

const labels = (values: readonly string[]) => sql.join(values.map(value => sql`${value}`), sql`, `);
const label = sql`lower(regexp_replace(replace(replace(trim(f->>'label'), '_', ' '), '-', ' '), '[[:space:]]+', ' ', 'g'))`;
const emailLabels = ["email", "e mail", "email address", "e mail address", "contact email"];
const companyLabels = ["company", "company name", "organization", "organisation", "school"];
const phoneLabels = ["phone", "phone number", "mobile", "mobile phone"];

/** One atomic import: source version, person and existing registration cells move together. */
export function applyHubSpotContactQuery(connectionId: string, workspaceId: string, contact: NormalizedHubSpotContact, runId: string | null) {
  const archived = contact.archived ? contact.sourceUpdatedAt : null;
  const shortCompany = contact.company?.slice(0, 120) ?? null;
  return sql`
    with previous as materialized (
      select * from hubspot_inbound_contacts where connection_id=${connectionId} and workspace_id=${workspaceId} and hubspot_contact_id=${contact.id} for update
    ), matches as materialized (
      select id from guests where workspace_id=${workspaceId} and lower(trim(contact))=${contact.email}
    ), eligible as materialized (
      select coalesce((select guest_id from previous),(select min(id) from matches having count(*)=1)) as guest_id,${archived}::timestamptz as archived_at,
        (select guest_id from previous) is null and (select count(*) from matches)>1 as ambiguous
      from (select count(*) from previous) p where
        not exists(select 1 from previous where source_updated_at>${contact.sourceUpdatedAt}::timestamptz)
        and exists (select 1 from hubspot_connections where id=${connectionId} and workspace_id=${workspaceId} and enabled=true and inbound_enabled=true)
    ), new_person as (
      insert into guests (id,workspace_id,name,contact)
      select ${`att_${randomUUID()}`},${workspaceId},${contact.name},${contact.email} from eligible m where m.guest_id is null and m.archived_at is null and not m.ambiguous
      on conflict (workspace_id,contact) do update set name=case when ${contact.hasName} then excluded.name else guests.name end,updated_at=now()
      returning id,name,contact
    ), changed_person as (
      update guests g set name=case when ${contact.hasName} then ${contact.name} else g.name end,
        contact=case when ${contact.issue}::text is null then ${contact.email} else g.contact end,updated_at=now()
      from eligible m where g.id=m.guest_id and g.workspace_id=${workspaceId} and m.archived_at is null
        and (${contact.email}::text is null or not exists(select 1 from guests other where other.workspace_id=${workspaceId} and lower(other.contact)=${contact.email} and other.id<>g.id))
      returning g.id,g.name,g.contact
    ), applied as (select * from new_person union all select * from changed_person), mirrored as (
      insert into hubspot_inbound_contacts (id,workspace_id,connection_id,hubspot_contact_id,guest_id,first_name,last_name,email,company,phone,email_opt_out,source_updated_at,archived_at,last_seen_run_id,import_error,updated_at)
      select ${`hsi_${randomUUID()}`},${workspaceId},${connectionId},${contact.id},coalesce((select id from applied limit 1),m.guest_id),${contact.firstName},${contact.lastName},${contact.email},${contact.company},${contact.phone},${contact.emailOptOut},${contact.sourceUpdatedAt}::timestamptz,${archived}::timestamptz,${runId},
        case when m.ambiguous then 'More than one Beebizy person uses this email. Review these records before importing.' when m.archived_at is null and m.guest_id is not null and not exists(select 1 from applied) then 'The new HubSpot email belongs to another person in Beebizy. Review these records before merging.' else ${contact.issue}::text end,now()
      from eligible m
      on conflict (connection_id,hubspot_contact_id) do update set
        guest_id=excluded.guest_id,
        first_name=case when excluded.archived_at is null then excluded.first_name else hubspot_inbound_contacts.first_name end,
        last_name=case when excluded.archived_at is null then excluded.last_name else hubspot_inbound_contacts.last_name end,
        email=case when excluded.archived_at is null then excluded.email else hubspot_inbound_contacts.email end,
        company=case when excluded.archived_at is null then excluded.company else hubspot_inbound_contacts.company end,
        phone=case when excluded.archived_at is null then excluded.phone else hubspot_inbound_contacts.phone end,
        email_opt_out=excluded.email_opt_out,source_updated_at=excluded.source_updated_at,archived_at=excluded.archived_at,
        last_seen_run_id=coalesce(excluded.last_seen_run_id,hubspot_inbound_contacts.last_seen_run_id),import_error=excluded.import_error,updated_at=now()
      where hubspot_inbound_contacts.workspace_id=${workspaceId} and hubspot_inbound_contacts.source_updated_at<=excluded.source_updated_at
      returning id
    ), seen as (
      update hubspot_inbound_contacts set last_seen_run_id=${runId}
      where connection_id=${connectionId} and workspace_id=${workspaceId} and hubspot_contact_id=${contact.id}
        and source_updated_at>${contact.sourceUpdatedAt}::timestamptz and ${runId}::text is not null
        and exists(select 1 from hubspot_connections where id=${connectionId} and workspace_id=${workspaceId} and enabled=true and inbound_enabled=true)
      returning id
    ), registrations_changed as (
      update registrations r set imported_fields=
        coalesce((select jsonb_agg(case
          when ${contact.hasName} and ${label} in (${labels(NAME_COLUMN_ALIASES.name)}) then jsonb_set(f,'{value}',to_jsonb(a.name))
          when ${contact.hasName} and ${label} in (${labels(NAME_COLUMN_ALIASES.firstName)}) then jsonb_set(f,'{value}',to_jsonb(${contact.firstName}::text))
          when ${contact.hasName} and ${label} in (${labels(NAME_COLUMN_ALIASES.lastName)}) then jsonb_set(f,'{value}',to_jsonb(${contact.lastName}::text))
          when ${label} in (${labels(emailLabels)}) then jsonb_set(f,'{value}',to_jsonb(coalesce(a.contact,'')))
          when ${label} in (${labels(companyLabels)}) and (coalesce(f->>'value','')='' or f->>'value'=left((select company from previous),120)) then jsonb_set(f,'{value}',to_jsonb(coalesce(${shortCompany}::text,'')))
          when ${label} in (${labels(phoneLabels)}) and (coalesce(f->>'value','')='' or f->>'value'=(select phone from previous)) then jsonb_set(f,'{value}',to_jsonb(coalesce(${contact.phone}::text,'')))
          else f end order by ord) from jsonb_array_elements(coalesce(r.imported_fields,'[]'::jsonb)) with ordinality as entry(f,ord)),'[]'::jsonb)
        || case when ${contact.hasName} and not exists(select 1 from jsonb_array_elements(coalesce(r.imported_fields,'[]'::jsonb)) f where ${label} in (${labels(NAME_COLUMN_ALIASES.firstName)})) then jsonb_build_array(jsonb_build_object('label','First Name','value',${contact.firstName}::text)) else '[]'::jsonb end
        || case when ${contact.hasName} and not exists(select 1 from jsonb_array_elements(coalesce(r.imported_fields,'[]'::jsonb)) f where ${label} in (${labels(NAME_COLUMN_ALIASES.lastName)})) then jsonb_build_array(jsonb_build_object('label','Last Name','value',${contact.lastName}::text)) else '[]'::jsonb end,
        organization=case when r.organization is null or r.organization=left((select company from previous),120) then ${shortCompany} else r.organization end,updated_at=now()
      from applied a where r.workspace_id=${workspaceId} and r.guest_id=a.id returning r.id
    ) select (select count(*) from mirrored)::int as mirrored,(select count(*) from applied)::int as applied,(select count(*) from registrations_changed)::int as registrations_changed,(select count(*) from seen)::int as seen`;
}

/** Deterministic transaction locks serialize duplicate deliveries and competing email changes. */
export function hubspotContactLocks(workspaceId: string, contacts: NormalizedHubSpotContact[]) {
  const keys = [...new Set(contacts.flatMap(contact => [`${workspaceId}:hubspot:${contact.id}`, ...(contact.email ? [`${workspaceId}:email:${contact.email}`] : [])]))].sort();
  return sql`select pg_advisory_xact_lock(hashtextextended(lock_key,0)) from unnest(array[${sql.join(keys.map(key => sql`${key}`),sql`, `)}]::text[]) as locks(lock_key) order by lock_key`;
}

export function queueHubSpotEventsQuery(connectionId: string, workspaceId: string, events: Array<{ id: string; time: number; kind: string }>) {
  const rows = sql.join(events.map(event => sql`(${event.id},${new Date(event.time).toISOString()},${event.kind})`), sql`, `);
  return sql`insert into hubspot_contact_inbox(connection_id,workspace_id,hubspot_contact_id,occurred_at,event_kind)
    select ${connectionId},${workspaceId},input.contact_id,input.occurred_at::timestamptz,input.event_kind from (values ${rows}) as input(contact_id,occurred_at,event_kind)
    where exists(select 1 from hubspot_connections where id=${connectionId} and workspace_id=${workspaceId} and enabled=true and inbound_enabled=true)
    on conflict(connection_id,hubspot_contact_id) do update set
      event_kind=case when excluded.occurred_at>=hubspot_contact_inbox.occurred_at then excluded.event_kind else hubspot_contact_inbox.event_kind end,
      occurred_at=greatest(hubspot_contact_inbox.occurred_at,excluded.occurred_at),updated_at=now()
    where hubspot_contact_inbox.workspace_id=${workspaceId} returning hubspot_contact_id`;
}
export function clearHubSpotEventsQuery(connectionId: string, workspaceId: string, events: Array<{ id: string; time: Date }>, lease: string) {
  const condition = sql.join(events.map(event => sql`(hubspot_contact_id=${event.id} and occurred_at<=${event.time.toISOString()}::timestamptz)`), sql` or `);
  return sql`delete from hubspot_contact_inbox where connection_id=${connectionId} and workspace_id=${workspaceId} and (${condition})
    and exists(select 1 from hubspot_connections where id=${connectionId} and workspace_id=${workspaceId} and inbound_enabled=true and enabled=true and webhook_lease_token=${lease}) returning hubspot_contact_id`;
}
