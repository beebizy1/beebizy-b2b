import { useMemo, useState } from "react";
import { Redirect } from "wouter";
import { Activity, Clock3, Mail, Search, TestTube2, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorNotice, LoadingRows, PageHeader, Panel, PanelHeader, Pill, StatTile } from "@/components/primitives";
import { useAdminUserActivity, useMe } from "@/data/hooks";
import type { AdminUserActivityRow } from "@/data/entities";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function when(value: string | null): string {
  return value ? dateTime.format(new Date(value)) : "Never";
}

function statusLabel(user: AdminUserActivityRow): string {
  if (user.isActiveNow) return "Active now";
  if (user.status === "invited") return "Invited";
  if (user.status === "active-member") return "Member";
  return "No current access";
}

function statusTone(user: AdminUserActivityRow): "success" | "warning" | "neutral" | "info" {
  if (user.isActiveNow) return "success";
  if (user.status === "invited") return "warning";
  if (user.status === "active-member") return "info";
  return "neutral";
}

export default function UserActivityDashboard() {
  const { data: identity, isLoading: identityLoading } = useMe();
  const canReview = identity?.canReviewFeedback === true;
  const activity = useAdminUserActivity(canReview);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "members" | "invited" | "no-access">("all");
  const [showTests, setShowTests] = useState(false);

  const users = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (activity.data?.users ?? []).filter((user) => {
      if (!showTests && user.isTestAccount) return false;
      if (status === "active" && !user.isActiveNow) return false;
      if (status === "members" && user.status !== "active-member") return false;
      if (status === "invited" && user.status !== "invited") return false;
      if (status === "no-access" && user.status !== "signed-in-no-access") return false;
      if (!needle) return true;
      return [
        user.name,
        user.email,
        ...user.workspaces.flatMap((workspace) => [workspace.workspaceName, workspace.role]),
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [activity.data?.users, search, showTests, status]);

  if (!identityLoading && !canReview) return <Redirect to="/app" replace />;

  const totals = activity.data?.totals;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Beebizy team only"
        title="Live user activity"
        description={`Names, access and sign-in activity across Beebizy Studio. Active now means activity within the last ${activity.data?.activeWindowMinutes ?? 5} minutes.`}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-success animate-pulse" aria-hidden="true" />
            Refreshes every 15 seconds
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="People signed in" value={totals?.authenticatedPeople ?? 0} icon={Users} loading={identityLoading || activity.isLoading} />
        <StatTile label="Active members" value={totals?.activeMembers ?? 0} icon={UserCheck} tone="info" loading={identityLoading || activity.isLoading} />
        <StatTile label="Active now" value={totals?.activeNow ?? 0} icon={Activity} tone="success" loading={identityLoading || activity.isLoading} />
        <StatTile label="Pending invites" value={totals?.pendingInvites ?? 0} icon={Mail} tone="warning" loading={identityLoading || activity.isLoading} />
        <StatTile label="Test accounts" value={totals?.testAccounts ?? 0} icon={TestTube2} loading={identityLoading || activity.isLoading} />
      </div>

      {activity.isError ? (
        <ErrorNotice error={activity.error} title="Couldn't load user activity" onRetry={() => void activity.refetch()} />
      ) : null}

      <Panel>
        <PanelHeader
          title="Users"
          description={activity.data ? `Live snapshot generated ${when(activity.data.generatedAt)} · ${users.length} shown` : "Loading live activity"}
          actions={
            <Button variant="outline" size="sm" onClick={() => void activity.refetch()} disabled={activity.isFetching}>
              <Clock3 className={`mr-1.5 size-3.5 ${activity.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          }
        />

        <div className="flex flex-col gap-3 border-b border-hairline p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email or workspace"
              aria-label="Search users"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="sm:w-44" aria-label="Filter user status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active now</SelectItem>
              <SelectItem value="members">Active members</SelectItem>
              <SelectItem value="invited">Pending invites</SelectItem>
              <SelectItem value="no-access">No current access</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant={showTests ? "secondary" : "outline"} onClick={() => setShowTests((value) => !value)}>
            <TestTube2 className="mr-1.5 size-4" />{showTests ? "Hide tests" : "Show tests"}
          </Button>
        </div>

        {identityLoading || activity.isLoading ? (
          <LoadingRows rows={7} className="p-4" />
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No users match these filters.</div>
        ) : (
          <ul className="divide-y divide-hairline">
            {users.map((user) => (
              <li key={user.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                    <Pill tone={statusTone(user)}>{statusLabel(user)}</Pill>
                    {user.isTestAccount ? <Pill>test</Pill> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {user.workspaces.length === 0 ? (
                    <span>No active workspace</span>
                  ) : user.workspaces.map((workspace) => (
                    <p key={`${user.id}:${workspace.workspaceId}`} className="truncate">
                      <span className="font-medium text-foreground">{workspace.workspaceName}</span> · {workspace.role}
                    </p>
                  ))}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Last active</p>
                  <p className="mt-1 text-xs text-foreground">{when(user.lastActiveAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Last sign-in</p>
                  <p className="mt-1 text-xs text-foreground">{when(user.lastSignInAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
