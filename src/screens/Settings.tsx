/**
 * Settings.
 *
 * Preferences are stored server-side against the user, not in localStorage, so they
 * follow the person rather than the browser. The backend panel states plainly which
 * mode the app is in and exactly what is needed to switch it — the old build hid that
 * in a code comment.
 */

import { Link } from "wouter";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { KeyValue, Panel, PanelHeader, PageHeader, Pill } from "@/components/primitives";
import { useMe, useSettings, useUpdateSettings } from "@/data/hooks";
import { useDataMode } from "@/data/provider";
import { useSession } from "@/app/session";
import type { UserSettings } from "@/data/entities";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"];

export default function Settings() {
  const { user, isDemo } = useSession();
  const { data: me } = useMe();
  const { mode, demoReason } = useDataMode();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const save = (patch: Partial<UserSettings>, message: string) => {
    updateSettings.mutate(patch, {
      onSuccess: () => toast({ title: message }),
      onError: (error) => toast({ title: "Couldn't save", description: error.message }),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Preferences"
        description="Stored against your account, so they follow you to any device."
      />

      <Panel>
        <PanelHeader title="Defaults" description="How lists and money are presented" />
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
          </div>
        </div>
      </Panel>

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
