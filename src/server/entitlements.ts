import { sql, type SQLWrapper } from "drizzle-orm";
import { SOLO_LIMITS, TEAM_LIMITS } from "../data/plans.ts";
import { events, workspaceInvites, workspaceMembers, workspaces } from "./schema.ts";

/** Occupied seats: everyone in the workspace, plus every invitation still outstanding. */
function occupiedSeats(workspaceId: string | SQLWrapper, additionalSeats: number) {
  return sql`(
    (select count(*) from ${workspaceMembers} where ${workspaceMembers.workspaceId} = ${workspaceId}) +
    (select count(*) from ${workspaceInvites}
      where ${workspaceInvites.workspaceId} = ${workspaceId}
        and ${workspaceInvites.acceptedAt} is null)
    + ${additionalSeats}
  )`;
}

/**
 * Whether a workspace fits *Solo's* seats, whatever it is on today.
 *
 * This is the gate for getting into Solo - Checkout and activation - where the workspace
 * is still pending and its own plan cannot answer the question.
 */
export function workspaceFitsSoloSeatLimit(workspaceId: string | SQLWrapper, additionalSeats = 0) {
  return sql`${occupiedSeats(workspaceId, additionalSeats)} <= ${SOLO_LIMITS.teamMembers}`;
}

/**
 * Whether a workspace fits the seats of the plan it is actually on.
 *
 * Used when a seat is taken rather than when a plan is bought, so Team's ceiling is
 * enforced as well as Solo's. A workspace that is not on a metered plan - no plan
 * recorded, not active, or Enterprise - passes, which is why the comparison is inside the
 * expression rather than around it: the caller cannot forget to allow for those.
 */
export function workspaceFitsPlanSeatLimit(workspaceId: string | SQLWrapper, additionalSeats = 0) {
  return sql`(
    ${workspaces.subscriptionStatus} <> 'active'
    or ${workspaces.subscriptionPlan} is null
    or ${occupiedSeats(workspaceId, additionalSeats)} <= case ${workspaces.subscriptionPlan}
         when 'solo' then ${SOLO_LIMITS.teamMembers}
         when 'team' then ${TEAM_LIMITS.teamMembers}
         else ${Number.MAX_SAFE_INTEGER}
       end
  )`;
}

/** Stable annual ranking used when existing events are assigned Solo quota slots. */
export function annualEventQuotaRank() {
  return sql<number>`row_number() over (
    partition by ${events.workspaceId}, extract(year from ${events.startsAt})
    order by ${events.startsAt}, ${events.id}
  )::integer`;
}
