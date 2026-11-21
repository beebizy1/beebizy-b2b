import type { WorkspaceProductProfile } from "../data/workspaceProfile.ts";

const tools: Record<string,string> = { vendors:"vendors",operations:"operations",registrations:"registrations","check-in":"check-in","check-in-stations":"check-in","run-of-show":"run-of-show",checklist:"checklist",volunteers:"volunteers","volunteer-needs":"volunteers",budget:"budget",deposits:"deposits","vendor-payment-plans":"deposits",floorplan:"floorplan",floorplans:"floorplan",menu:"menu","mood-board":"inspiration",tickets:"tickets",raffle:"raffle",sponsorships:"fundraising",auction:"fundraising",rfps:"rfp",contingency:"contingency" };

/** Product configuration narrows tools; it never grants ownership or plan capabilities. */
export function workspaceRouteToolAllowed(profile:WorkspaceProductProfile|undefined,segments:string[]):boolean {
  if(!profile?.eventTabs || segments[0]!=="events" || !segments[1] || !segments[2])return true;
  const tool=tools[segments[2]];
  if(!tool)return true;
  if(tool==="fundraising")return profile.eventTabs.some(id=>["fundraising","silent-auction","live-auction"].includes(id));
  return profile.eventTabs.some(id=>id===tool);
}
