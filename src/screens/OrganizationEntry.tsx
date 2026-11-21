import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useData } from "@/data/provider";
import { useSession } from "@/app/session";
import { selectWorkspace } from "@/data/workspaceSelection";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { ErrorNotice } from "@/components/primitives";

export default function OrganizationEntry({ workspaceId }: { workspaceId?: string }) {
  const adapter = useData(); const { user, signOut } = useSession(); const [openingError,setOpeningError]=useState("");
  const query = useQuery({ queryKey: ["my-organizations",adapter.cacheScope], queryFn: () => adapter.workspaces() });
  const chosen = query.data?.find(row => row.id === workspaceId);
  useEffect(() => {
    if (chosen && user) {
      try { selectWorkspace(user.uid,chosen.id); window.location.replace("/app"); }
      catch { setOpeningError("Your browser could not remember this organization. Allow session storage for Beebizy, then reopen your organization link."); }
    }
  },[chosen,user]);
  return <main className="grid min-h-dvh place-items-center bg-background p-5"><div className="w-full max-w-xl space-y-6"><BrandLogo size="lg" /><div className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
    <h1 className="text-2xl font-bold">{workspaceId ? "Opening your organization" : "Choose your organization"}</h1>
    <p className="mt-2 text-sm text-muted-foreground">You are signed in as {user?.email}. Each organization has its own events, guests and vendors.</p>
    {openingError?<p role="alert" className="mt-4 text-sm text-danger-text">{openingError}</p>:null}
    {query.error ? <div className="mt-5"><ErrorNotice error={query.error} onRetry={() => void query.refetch()} /></div> : query.isLoading ? <p className="mt-5">Checking your access…</p> : workspaceId && !chosen ? <div role="alert" className="mt-5 space-y-4"><p>This account has not been invited to this organization. Opening its link does not grant access.</p><Button variant="outline" onClick={() => void signOut()}>Sign in with a different account</Button><Button asChild variant="outline"><Link href="/organizations">See my organizations</Link></Button></div> : !workspaceId ? <div className="mt-6 space-y-3">{query.data?.map(row => <Button key={row.id} asChild variant="outline" className="h-auto w-full justify-start gap-3 p-4 text-left"><Link href={row.signInPath}><Building2 className="size-5 shrink-0" /><span className="min-w-0 whitespace-normal"><strong className="block">{row.name}</strong><span className="text-xs text-muted-foreground">{row.profile.kind === "planner" ? "Event planning workspace" : "Organization workspace"}</span></span></Link></Button>)}{!query.data?.length ? <p>Your invitation may still be pending. Ask your organization administrator to invite this email address.</p> : null}</div> : <p className="mt-5">Opening {chosen?.name}…</p>}
  </div><Link href="/app" className="block text-sm underline">Back to Studio</Link></div></main>;
}
