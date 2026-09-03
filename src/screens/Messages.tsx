import { Link } from "wouter";
import { MessageSquare, Store } from "lucide-react";
import { EmptyState, ErrorNotice, LoadingRows, PageHeader, Panel, PanelHeader, Pill } from "@/components/primitives";
import { useVendors } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";

export default function Messages() {
  const { data: vendors, isLoading, isError, error, refetch } = useVendors();
  const { when } = usePreferences();
  const conversations = (vendors ?? [])
    .filter((vendor) => vendor.lastMessage)
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Every vendor conversation, together"
        description="Review replies, keep briefs attached to the right vendor, and continue the conversation without leaving Beebizy."
      />

      {isError ? <ErrorNotice error={error} title="Couldn't load messages" onRetry={() => void refetch()} /> : null}

      <Panel>
        <PanelHeader title="Vendor inbox" description="Newest activity first" />
        {isLoading ? (
          <LoadingRows rows={6} className="p-4" />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No vendor conversations yet"
            description="Open a vendor and send a brief. Replies will collect here."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {conversations.map((vendor) => (
              <li key={vendor.id}>
                <Link
                  href={`/app/vendors/${vendor.id}`}
                  className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-accent/60"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-muted text-foreground">
                    <Store className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{vendor.name}</span>
                      <Pill>{vendor.category}</Pill>
                      {vendor.unreadCount > 0 ? <Pill tone="info">{vendor.unreadCount} new</Pill> : null}
                    </span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">{vendor.lastMessage}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {vendor.lastMessageAt ? when(vendor.lastMessageAt) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
