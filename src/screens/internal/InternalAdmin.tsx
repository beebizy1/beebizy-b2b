import { useEffect, useState, type ReactNode } from "react";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LockKeyhole, Users, MessagesSquare } from "lucide-react";
import { useData } from "@/data/provider";
import { isDataError } from "@/data/adapter";
import { useMe } from "@/data/hooks";
import { useOperatorDraft } from "@/hooks/useOperatorDraft";
import { GuestDraftStatus } from "@/components/GuestDraftStatus";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ShareLinkField from "@/components/ShareLinkField";
import { ErrorNotice } from "@/components/primitives";
import { HIDEABLE_EVENT_TAB_IDS } from "@/data/eventNavigation";
import { EVENT_TABS } from "@/app/shell/nav";
import { ORGANIZATION_EVENT_TABS, type OrganizationSummary, type WorkspaceProductProfile } from "@/data/workspaceProfile";
import UserActivityDashboard from "@/screens/UserActivityDashboard";
import FeedbackInbox from "@/screens/FeedbackInbox";

function InternalGate({children}:{children:ReactNode}) {
  const identity = useMe();
  if (identity.isLoading) return <p className="p-8">Checking internal access…</p>;
  if (identity.error) return <div className="p-8"><ErrorNotice error={identity.error} onRetry={() => void identity.refetch()} /></div>;
  if (!identity.data?.canReviewFeedback) return <main className="mx-auto max-w-lg space-y-4 p-8"><LockKeyhole /><h1 className="text-2xl font-bold">Beebizy team only</h1><p>This dashboard is for Beebizy staff. Your organization's events are in Studio.</p><Button asChild><Link href="/app">Open my workspace</Link></Button></main>;
  return <>{children}</>;
}

function OrganizationEditor({organization,onClose}:{organization:OrganizationSummary|null;onClose():void}) {
  const adapter=useData();const cache=useQueryClient();const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [savedLink,setSavedLink]=useState("");const [published,setPublished]=useState<OrganizationSummary|null>(organization);
  useEffect(()=>{if(organization&&organization.revision>(published?.revision??-1))setPublished(organization);},[organization,published?.revision]);
  const initialProfile=organization?.profile??{kind:"organization",experience:"standard",eventTabs:ORGANIZATION_EVENT_TABS};
  const {draft,state,recovery,setDraft}=useOperatorDraft(organization?`workspace-${organization.id}`:"new-organization",{name:organization?.name??"",profile:JSON.stringify(initialProfile),pilotEmail:"",requestId:crypto.randomUUID(),baseRevision:String(organization?.revision??0)});
  const profile:WorkspaceProductProfile=JSON.parse(draft.profile||JSON.stringify(initialProfile));
  const change=(patch:Record<string,string>)=>{setError("");setDraft({...draft,...patch});};
  const updateProfile=(patch:Partial<WorkspaceProductProfile>)=>change({profile:JSON.stringify({...profile,...patch})});
  async function save(){setBusy(true);setError("");const expected={...draft};try{
    const value=organization?await adapter.admin.updateOrganization(organization.id,{name:draft.name,profile,expectedRevision:Number(draft.baseRevision)}):await adapter.admin.createOrganization({name:draft.name,profile,pilotEmail:draft.pilotEmail,requestId:draft.requestId});
    setPublished({...value,memberCount:published?.memberCount??2,eventCount:published?.eventCount??0,canOpen:published?.canOpen??true,previous:published?{name:published.name,profile:published.profile,revision:published.revision}:null});
    recovery.complete(expected,{name:value.name,profile:JSON.stringify(value.profile),baseRevision:String(value.revision),pilotEmail:"",requestId:draft.requestId});
    await cache.invalidateQueries({queryKey:["internal-organizations",adapter.cacheScope]});
    setSavedLink(location.origin+value.signInPath);
  }catch(e){
    setError(e instanceof Error?e.message:"Could not save. Your private draft is preserved.");
    if(isDataError(e)&&e.code==="conflict"&&organization){
      try{const latest=await cache.fetchQuery({queryKey:["internal-organizations",adapter.cacheScope],queryFn:()=>adapter.admin.organizations(),staleTime:0});const current=latest.find(row=>row.id===organization.id);if(current)setPublished(current);}catch{setError("Your draft is safe, but newer settings could not load. Close and reopen this form when your connection returns.");}
    }
  }finally{setBusy(false);}}
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{organization?`Set up ${organization.name}`:"Add a pilot organization"}</DialogTitle><DialogDescription>Changes stay private until you save. Existing events and amounts are preserved.</DialogDescription></DialogHeader>
    <GuestDraftStatus state={{...state,message:state.message.replace("guest details","organization settings").replace("guest draft","organization draft").replace("Submit to apply these details.","Choose Save organization to apply them.")}} recovery={recovery}/>
    <fieldset disabled={busy} className="space-y-4"><label className="block space-y-2 text-sm font-semibold">Organization name<Input value={draft.name} maxLength={150} onChange={e=>change({name:e.target.value})}/></label>
    {!organization?<label className="block space-y-2 text-sm font-semibold">Pilot administrator email<Input type="email" value={draft.pilotEmail} onChange={e=>change({pilotEmail:e.target.value})}/><span className="block text-xs font-normal text-muted-foreground">This grants owner access when they sign in with this verified email. Creating the organization does not send email.</span></label>:null}
    <label className="block space-y-2 text-sm font-semibold">How does this team work?<select className="block h-11 w-full rounded-lg border border-input px-3" value={profile.kind} onChange={e=>updateProfile({kind:e.target.value as WorkspaceProductProfile['kind']})}><option value="organization">Organization: track vendor costs</option><option value="planner">Event planner: vendor costs, client charges and margin</option></select></label>
    <label className="block space-y-2 text-sm font-semibold">Workspace presentation<select className="block h-11 w-full rounded-lg border border-input px-3" value={profile.experience} onChange={e=>updateProfile({experience:e.target.value as WorkspaceProductProfile['experience']})}><option value="standard">Beebizy</option><option value="santa-clara">Santa Clara University</option></select></label>
    <fieldset className="space-y-3 rounded-xl border border-hairline p-4"><legend className="px-2 text-sm font-semibold">Event tools this organization needs</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.eventTabs===null} onChange={e=>updateProfile({eventTabs:e.target.checked?null:[...ORGANIZATION_EVENT_TABS]})}/>Use the standard tools for this presentation</label>{profile.eventTabs!==null?<div className="grid gap-3 sm:grid-cols-2">{HIDEABLE_EVENT_TAB_IDS.map(id=><label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.eventTabs!.includes(id)} onChange={e=>updateProfile({eventTabs:e.target.checked?[...profile.eventTabs!,id]:profile.eventTabs!.filter(value=>value!==id)})}/>{EVENT_TABS.find(t=>t.id===id)?.label??id}</label>)}</div>:null}</fieldset>
    {published?.previous?<Button variant="outline" onClick={()=>change({name:published.previous!.name,profile:JSON.stringify(published.previous!.profile)})}>Load previous settings as a draft</Button>:null}
    {published&&Number(draft.baseRevision)!==published.revision?<div role="alert" className="space-y-2 text-sm"><p>A newer profile was published. Your draft has not been discarded.</p><Button variant="outline" onClick={()=>recovery.complete(draft,{name:published!.name,profile:JSON.stringify(published!.profile),baseRevision:String(published!.revision),pilotEmail:"",requestId:draft.requestId})}>Load current published settings</Button></div>:null}
    {error?<p role="alert" className="text-sm text-danger-text">{error}</p>:null}
    <p className="text-xs text-muted-foreground">Saving a profile changes tools and wording, not ownership. Hidden tools and client-charge amounts are retained. Staff administration stays separate from every customer workspace.</p>
    <Button disabled={busy||(!organization&&!!savedLink)||!draft.name.trim()||(!organization&&!draft.pilotEmail.trim())||!!state.remote} onClick={()=>void save()}>{busy?"Saving…":organization?"Save organization":"Create organization and grant pilot access"}</Button>
    </fieldset>{savedLink?<div role="status" className="space-y-3 rounded-xl bg-primary/10 p-4"><p>Organization saved. Copy this link and share it with its invited team. No email was sent.</p><ShareLinkField label="Organization sign-in link" value={savedLink}/></div>:null}
  </DialogContent></Dialog>;
}

function OrganizationsAdmin(){const adapter=useData();const [search,setSearch]=useState("");const [editing,setEditing]=useState<OrganizationSummary|null|undefined>();const query=useQuery({queryKey:["internal-organizations",adapter.cacheScope],queryFn:()=>adapter.admin.organizations()});const rows=query.data?.filter(row=>row.name.toLowerCase().includes(search.toLowerCase()));return <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">Organizations</h1><p className="mt-2 text-sm text-muted-foreground">Separate workspaces, sign-in links and tools for every pilot.</p></div><Button onClick={()=>setEditing(null)}>Add organization</Button></div><Input aria-label="Find an organization" placeholder="Find an organization…" value={search} onChange={e=>setSearch(e.target.value)}/>{query.error?<ErrorNotice error={query.error} onRetry={()=>void query.refetch()}/>:query.isLoading?<p>Loading organizations…</p>:<div className="grid gap-4 lg:grid-cols-2">{rows?.map(row=><section key={row.id} className="space-y-4 rounded-2xl border border-hairline bg-white p-5"><div><h2 className="text-lg font-bold">{row.name}</h2><p className="mt-1 text-sm text-muted-foreground">{row.profile.kind==="planner"?"Event planner":"Organization"} · {row.eventCount} events · {row.memberCount} team members</p></div><ShareLinkField label={`Sign-in link for ${row.name}`} value={location.origin+row.signInPath}/><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setEditing(row);void query.refetch();}}>Set up workspace</Button>{row.canOpen?<Button asChild variant="outline"><Link href={row.signInPath}>Open Studio</Link></Button>:<p className="text-xs text-muted-foreground">Your staff account is not a member of this customer's workspace.</p>}</div></section>)}</div>}{editing!==undefined?<OrganizationEditor key={editing?.id??"new"} organization={editing ? (query.data?.find(row=>row.id===editing.id)??editing) : null} onClose={()=>setEditing(undefined)}/>:null}</div>;}

export default function InternalAdmin(){const [path]=useLocation();return <InternalGate><div className="min-h-dvh bg-background"><header className="border-b border-hairline bg-white p-5"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><BrandLogo size="sm"/><span className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="size-4"/>Internal admin</span></div><Button asChild variant="outline"><Link href="/organizations">Open an organization</Link></Button></div></header><div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8"><nav aria-label="Internal administration" className="flex flex-wrap gap-2">{[["/internal","Organizations",Building2],["/internal/users","User activity",Users],["/internal/feedback","Pilot feedback",MessagesSquare]] .map(([href,label,Icon])=>{const Glyph=Icon as typeof Building2;return <Button asChild key={String(href)} variant={path===href?"default":"outline"}><Link href={String(href)}><Glyph className="size-4"/>{String(label)}</Link></Button>;})}</nav><Switch><Route path="/internal" component={OrganizationsAdmin}/><Route path="/internal/users" component={UserActivityDashboard}/><Route path="/internal/feedback" component={FeedbackInbox}/><Route><Redirect to="/internal" replace/></Route></Switch></div></div></InternalGate>;}
