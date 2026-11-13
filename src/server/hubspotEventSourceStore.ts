import { sql } from "drizzle-orm";
import type { HubSpotEventSourceMessage } from "../data/hubspotEventSource.ts";

/** Lock the saved source before inserting. A pause or changed list fences in-flight work. */
export function addHubSpotListRegistrationsQuery(workspaceId: string, connectionId: string, message: HubSpotEventSourceMessage, lease: string, contactIds: string[]) {
  return sql`with source as materialized (
    select p.* from hubspot_event_sources p
    join events e on e.id=p.event_id and e.workspace_id=p.workspace_id
    join hubspot_connections c on c.id=p.connection_id and c.workspace_id=p.workspace_id
    where p.event_id=${message.eventId} and p.workspace_id=${workspaceId} and p.connection_id=${connectionId}
      and p.generation=${message.generation} and p.tick=${message.tick} and p.lease_token=${lease} and p.enabled
      and c.enabled and c.inbound_enabled for update of p
  ), added as (
    insert into registrations(id,workspace_id,event_id,guest_id,status,segment,organization,quantity,imported_fields)
    select 'reg_'||gen_random_uuid()::text,h.workspace_id,p.event_id,g.id,'confirmed','General',left(h.company,120),1,
      jsonb_build_array(
        jsonb_build_object('label','Full Name','value',g.name),
        jsonb_build_object('label','First Name','value',h.first_name),
        jsonb_build_object('label','Last Name','value',h.last_name),
        jsonb_build_object('label','Email Address','value',coalesce(g.contact,'')),
        jsonb_build_object('label','Phone','value',coalesce(h.phone,'')),
        jsonb_build_object('label','RSVP Response','value','Yes'),
        jsonb_build_object('label','Source','value','HubSpot registration list'),
        jsonb_build_object('label','HubSpot list ID','value',p.list_id))
    from source p join hubspot_inbound_contacts h on h.connection_id=p.connection_id and h.workspace_id=p.workspace_id
    join guests g on g.id=h.guest_id and g.workspace_id=p.workspace_id
    where h.hubspot_contact_id=any(array[${sql.join(contactIds.map(id => sql`${id}`), sql`, `)}]::text[]) and h.archived_at is null and h.import_error is null
      and not exists(select 1 from registrations r where r.event_id=p.event_id and r.guest_id=g.id)
    on conflict(event_id,guest_id) do nothing returning id
  ) select count(*)::int as added from added`;
}
