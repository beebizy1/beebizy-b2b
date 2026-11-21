import { z } from "zod";
import { HIDEABLE_EVENT_TAB_IDS, type HideableEventTabId } from "./eventNavigation.ts";

export const workspaceProfileSchema = z.object({
  kind: z.enum(["planner", "organization"]),
  experience: z.enum(["standard", "santa-clara"]),
  eventTabs: z.array(z.enum(HIDEABLE_EVENT_TAB_IDS)).max(HIDEABLE_EVENT_TAB_IDS.length).nullable(),
});
export type WorkspaceProductProfile = z.infer<typeof workspaceProfileSchema>;

export function normalizeWorkspaceProfile(value: unknown, experience: "standard" | "santa-clara" = "standard"): WorkspaceProductProfile {
  const parsed = workspaceProfileSchema.safeParse(value);
  return parsed.success
    ? { ...parsed.data, eventTabs: parsed.data.eventTabs ? [...new Set(parsed.data.eventTabs)] : null }
    : { kind: experience === "santa-clara" ? "organization" : "planner", experience, eventTabs: null };
}

export const ORGANIZATION_EVENT_TABS: HideableEventTabId[] = ["operations", "vendors", "run-of-show", "registrations", "check-in", "checklist", "budget", "deposits", "floorplan", "volunteers", "fundraising"];
export const organizationSignInPath = (workspaceId: string) => `/organization/${encodeURIComponent(workspaceId)}`;

export interface OrganizationWorkspace {
  id: string;
  name: string;
  profile: WorkspaceProductProfile;
  updatedAt: string;
  revision: number;
  signInPath: string;
}
export interface OrganizationSummary extends OrganizationWorkspace {
  memberCount: number;
  eventCount: number;
  canOpen: boolean;
  previous?: { name: string; profile: WorkspaceProductProfile; revision: number } | null;
}
export interface OrganizationDraft {
  requestId: string;
  name: string;
  profile: WorkspaceProductProfile;
  pilotEmail: string;
}
export interface OrganizationPatch {
  name: string;
  profile: WorkspaceProductProfile;
  expectedRevision: number;
}

/** An organization selector never grants membership and cannot name another origin. */
export function organizationIdFromPath(path: string): string | null {
  const match = /^\/organization\/([a-zA-Z0-9_-]{1,100})\/?$/.exec(path);
  return match?.[1] ?? null;
}
