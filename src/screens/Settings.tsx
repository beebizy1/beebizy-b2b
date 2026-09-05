/**
 * Settings.
 *
 * Preferences are stored server-side against the user, not in localStorage, so they
 * follow the person rather than the browser. The backend panel states plainly which
 * mode the app is in and exactly what is needed to switch it — the old build hid that
 * in a code comment.
 */

import { useState } from "react";
import { Link } from "wouter";
import { Database, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ErrorNotice, KeyValue, LoadingRows, Panel, PanelHeader, PageHeader, Pill } from "@/components/primitives";
import {
  useInviteMember,
  useMe,
  useMembers,
  useRevokeInvite,
  useRemoveMember,
  useSetMemberRole,
  useSettings,
  useUpdateSettings,
} from "@/data/hooks";
import { useDataMode } from "@/data/provider";
import { useSession } from "@/app/session";
import { usePreferences } from "@/app/preferences";
import { WORKSPACE_ROLES, type UserSettings, type WorkspaceRole } from "@/data/entities";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"];

/**
 * A short list rather than the full IANA set, because the full set is 400-odd names and
 * a searchable combobox to make it usable. These cover the zones a lean team is likely to
 * be running events in; a zone already stored outside the list still displays, because
 * the trigger renders the stored value rather than only what it can find here.
 */
const TIME_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

/**
 * Who is in the workspace, and what they may do.
 *
 * Only an owner can change this — that is the "super admin" of the request. Everyone else
 * sees the list read-only, which is deliberate: knowing who has access is not a privilege,
 * but granting it is.
 */
/** The "+ Add team member" flow: an address and the role they should get. */
function InviteMemberDialog() {
  const invite = useInviteMember();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");

  const submit = () => {
    invite.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => {
          setOpen(false);
          setEmail("");
          setRole("member");
          toast({
            title: "Invite added",
            description: "They get access as soon as they sign in with that address.",
          });
        },
        onError: (error) => toast({ title: "Couldn't add them", description: error.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-3.5" />
          Add team member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>
            They join this workspace with the role you choose, the first time they sign in with this address.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (email.trim()) submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(inputEvent) => setEmail(inputEvent.target.value)}
              placeholder="colleague@company.com"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member — can view and edit, cannot delete</SelectItem>
                <SelectItem value="admin">Admin — can also delete records</SelectItem>
                <SelectItem value="owner">Owner — can also manage the team</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            No invitation email is sent yet, so tell them to sign in at this address themselves.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!email.trim() || invite.isPending}>
              Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamPanel() {
  const { data: identity } = useMe();
  const { data: members, isLoading, isError, error, refetch } = useMembers();
  const setRole = useSetMemberRole();
  const removeMember = useRemoveMember();
  const revokeInvite = useRevokeInvite();
  const isOwner = identity?.role === "owner";

  return (
    <Panel>
      <PanelHeader
        title="Team & permissions"
        description={
          isOwner
            ? "Owners manage access. Admins can delete records; members cannot."
            : "Only an owner can change roles or remove people."
        }
        actions={isOwner ? <InviteMemberDialog /> : undefined}
      />

      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
      ) : isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (
        <ul className="divide-y divide-hairline">
          {(members ?? []).map((member) => {
            const label = member.name ?? member.email ?? member.userId ?? "Unknown";
            return (
              <li key={member.userId ?? member.email} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {label}
                    {member.isSelf ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.status === "invited"
                      ? `${member.email} · hasn't signed in yet`
                      : (member.email ?? "No email on file")}
                  </p>
                </div>

                {member.status === "invited" ? <Pill tone="warning">invited</Pill> : null}

                {/* An unclaimed seat has no user to update, so its role is changed by re-inviting. */}
                {isOwner && !member.isSelf && member.status === "active" && member.userId ? (
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      setRole.mutate(
                        { userId: member.userId!, role: value as WorkspaceRole },
                        {
                          onError: (mutationError) =>
                            toast({ title: "Couldn't change the role", description: mutationError.message }),
                        },
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-[132px]" aria-label={`Role for ${label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKSPACE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Pill tone={member.role === "owner" ? "success" : "neutral"}>{member.role}</Pill>
                )}

                {isOwner && !member.isSelf ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (member.status === "invited" && member.email) {
                        revokeInvite.mutate(
                          { email: member.email },
                          {
                            onError: (mutationError) =>
                              toast({ title: "Couldn't cancel the invite", description: mutationError.message }),
                          },
                        );
                        return;
                      }
                      if (!window.confirm(`Remove ${label} from the workspace?`)) return;
                      removeMember.mutate(
                        { userId: member.userId! },
                        {
                          onError: (mutationError) =>
                            toast({ title: "Couldn't remove them", description: mutationError.message }),
                        },
                      );
                    }}
                  >
                    {member.status === "invited" ? "Cancel" : "Remove"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t border-hairline px-5 py-3 text-xs text-muted-foreground">
        An invited person joins this workspace the first time they sign in with that address. No invitation
        email goes out yet, so send them the link yourself.
      </p>
    </Panel>
  );
}

export default function Settings() {
  const { user, isDemo } = useSession();
  const { data: me } = useMe();
  const { mode, demoReason } = useDataMode();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const prefs = usePreferences();

  const save = (patch: Partial<UserSettings>, message: string) => {
    updateSettings.mutate(patch, {
      onSuccess: () => toast({ title: message }),
      onError: (error) => toast({ title: "Couldn't save", description: error.message }),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Preferences"
        description="Stored against your account, so they follow you to any device."
      />

      <Panel>
        <PanelHeader title="Defaults" description="How lists, dates and money are presented" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="grouping">Group events by</Label>
            <Select
              value={settings?.homeGrouping ?? "location"}
              onValueChange={(value) =>
                save({ homeGrouping: value as UserSettings["homeGrouping"] }, "Grouping saved")
              }
            >
              <SelectTrigger id="grouping">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="location">Venue</SelectItem>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={settings?.currency ?? "USD"}
              onValueChange={(value) => save({ currency: value }, "Currency saved")}
            >
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Every amount in the app, e.g. {prefs.money(150_000)}.
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="timezone">Time zone</Label>
            <Select
              value={settings?.timeZone ?? "America/Los_Angeles"}
              onValueChange={(value) => save({ timeZone: value }, "Time zone saved")}
            >
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_ZONES.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Stating the consequence, because this is the setting people get wrong: a
                shared event page shows the venue's zone to a guest, not the guest's. */}
            <p className="text-xs text-muted-foreground">
              Every date and time, for everyone on the team and on shared event pages. Right now that
              reads {prefs.date(new Date(), "full")} ({prefs.timeZoneLabel}).
            </p>
          </div>
        </div>
      </Panel>

      <TeamPanel />

      <Panel>
        <PanelHeader title="Account" />
        <dl className="divide-y divide-hairline px-5 py-2">
          <KeyValue label="Name">{user?.name ?? "—"}</KeyValue>
          <KeyValue label="Email">{user?.email ?? "—"}</KeyValue>
          <KeyValue label="Session">
            {isDemo ? <Pill tone="warning">Demo</Pill> : <Pill tone="success">Signed in</Pill>}
          </KeyValue>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader
          title="Backend"
          description="Where your data lives and who authorizes it"
          actions={mode === "live" ? <Pill tone="success">Live</Pill> : <Pill tone="warning">Demo</Pill>}
        />
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {demoReason ??
                "Signed in with Clerk, reading and writing Postgres through the API. Everything is scoped to your workspace."}
            </p>
          </div>

          {mode === "live" ? (
            <dl className="divide-y divide-hairline rounded-lg border border-hairline bg-surface-sunken px-4 py-1">
              <KeyValue label="Sign-in">Clerk</KeyValue>
              <KeyValue label="Database">Neon Postgres</KeyValue>
              <KeyValue label="Your role">{me?.role ?? "—"}</KeyValue>
            </dl>
          ) : (
            <div className="space-y-2 rounded-lg border border-hairline bg-surface-sunken p-4">
              <p className="text-sm font-semibold text-foreground">To run against real data</p>
              <p className="text-xs text-muted-foreground">
                Both halves are Vercel Marketplace integrations, so there are no credentials to copy by
                hand:
              </p>
              <ul className="space-y-1 pt-1 font-mono text-xs text-foreground">
                <li>vercel integration add clerk</li>
                <li>vercel integration add neon</li>
                <li>vercel env pull</li>
              </ul>
            </div>
          )}

          <Button asChild variant="outline" size="sm">
            <Link href="/app">Back to Today</Link>
          </Button>
        </div>
      </Panel>

    </div>
  );
}
