import {describe,expect,it}from"vitest";
import{workspaceRouteToolAllowed}from"./workspaceTools";
describe("organization event tools",()=>{
  it("keeps report dependencies readable without enabling hidden editing tools",()=>{
    const profile={kind:"organization" as const,experience:"santa-clara" as const,eventTabs:["operations"] as "operations"[]};
    expect(workspaceRouteToolAllowed(profile,["events","e","sponsorships"],"GET")).toBe(true);
    expect(workspaceRouteToolAllowed(profile,["events","e","vendors"],"GET")).toBe(true);
    expect(workspaceRouteToolAllowed(profile,["events","e","sponsorships"],"POST")).toBe(false);
    expect(workspaceRouteToolAllowed(profile,["events","e","vendors"],"PATCH")).toBe(false);
    expect(workspaceRouteToolAllowed(profile,["events","e","menu"],"GET")).toBe(false);
  });
  it("blocks disabled event tools even when called directly while preserving event and draft reads",()=>{
    const profile={kind:"organization" as const,experience:"standard" as const,eventTabs:["vendors","budget"] as ("vendors"|"budget")[]};
    expect(workspaceRouteToolAllowed(profile,["events","e","budget"])).toBe(true);
    expect(workspaceRouteToolAllowed(profile,["events","e","vendors"])).toBe(true);
    expect(workspaceRouteToolAllowed(profile,["events","e","deposits"])).toBe(false);
    expect(workspaceRouteToolAllowed(profile,["events","e"])).toBe(true);
    expect(workspaceRouteToolAllowed(profile,["events","e","guest-editor-drafts"])).toBe(true);
    expect(workspaceRouteToolAllowed({...profile,eventTabs:[]},["events","e","vendors"])).toBe(false);
    expect(workspaceRouteToolAllowed({...profile,eventTabs:null},["events","e","vendors"])).toBe(true);
  });
});
