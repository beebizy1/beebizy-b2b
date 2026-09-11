import { sql, type SQLWrapper } from "drizzle-orm";
import { SOLO_LIMITS } from "../data/plans.ts";
import { events, workspaceInvites, workspaceMembers } from "./schema.ts";

/** One definition of an occupied Solo seat for Checkout, activation, and invitations. */
export function workspaceFitsSoloSeatLimit(workspaceId: string | SQLWrapper, additionalSeats = 0) {
  return sql`(
    (select count(*) from ${workspaceMembers} where ${workspaceMembers.workspaceId} = ${workspaceId}) +
    (select count(*) from ${workspaceInvites}
      where ${workspaceInvites.workspaceId} = ${workspaceId}
        and ${workspaceInvites.acceptedAt} is null)
    + ${additionalSeats}
  ) <= ${SOLO_LIMITS.teamMembers}`;
}

/** Stable annual ranking used when existing events are assigned Solo quota slots. */
export function annualEventQuotaRank() {
  return sql<number>`row_number() over (
    partition by ${events.workspaceId}, extract(year from ${events.startsAt})
    order by ${events.startsAt}, ${events.id}
  )::integer`;
}
