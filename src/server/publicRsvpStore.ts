import { sql } from "drizzle-orm";
import type { PublicRsvpPerson } from "../data/publicRsvpParty.ts";

export interface RsvpPartyInsert {
  eventId: string; workspaceId: string; segment: string; organization: string | null; partyId: string;
  people: Array<PublicRsvpPerson & { guestId: string; registrationId: string }>;
}
/** Execute together in one db.batch transaction. A duplicate/full event rolls back the entire party. */
export function publicRsvpPartyQueries(input: RsvpPartyInsert) {
  const { eventId, workspaceId, segment, organization, people, partyId } = input;
  const queries = [sql`select pg_advisory_xact_lock(hashtext(${eventId}))`];
  const keys = [...new Set(people.flatMap(person => person.email ? [`${workspaceId}:email:${person.email}`] : []))].sort();
  if (keys.length) queries.push(sql`select pg_advisory_xact_lock(hashtextextended(lock_key,0)) from unnest(array[${sql.join(keys.map(key => sql`${key}`), sql`, `)}]::text[]) locks(lock_key) order by lock_key`);
  for (const person of people) {
    const fields = people.length > 1 ? [...person.fields, { label: "RSVP group", value: partyId }, { label: "Registered by", value: people[0]!.name }, { label: "Registrant email", value: people[0]!.email! }] : person.fields;
    queries.push(sql`insert into guests(id,workspace_id,name,contact,notes)
      select ${person.guestId},${workspaceId},${person.name},${person.email},'Registered through the public event page.'
      where ${person.email}::text is null or not exists(select 1 from guests where workspace_id=${workspaceId} and lower(trim(contact))=${person.email})
      on conflict(workspace_id,contact) do nothing`);
    queries.push(sql`insert into registrations(id,workspace_id,event_id,guest_id,status,segment,organization,quantity,imported_fields)
      values(${person.registrationId},${workspaceId},${eventId},
        (select id from guests where workspace_id=${workspaceId} and (case when ${person.email}::text is null then id=${person.guestId} else lower(trim(contact))=${person.email} end)),
        'confirmed',${segment},${organization},1,${JSON.stringify(fields)}::jsonb)`);
  }
  return queries;
}
