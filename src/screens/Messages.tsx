import { useState } from "react";
import { Link, useLocation } from "wouter";
import { MessageSquare, PenSquare, Send, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { EmptyState, ErrorNotice, LoadingRows, PageHeader, Panel, PanelHeader, Pill } from "@/components/primitives";
import { useSendVendorMessage, useVendors } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";
import { useSession } from "@/app/session";
import type { Vendor } from "@/data/entities";

/**
 * Starting a conversation from the inbox.
 *
 * The composer already existed on the vendor page, so the inbox told you to go and find
 * it — an empty state that describes the way out without opening the door. Picking the
 * vendor here is the whole feature: the send itself is the same call the vendor page makes.
 */
function NewMessageDialog({ vendors }: { vendors: Vendor[] }) {
  const send = useSendVendorMessage();
  const { user } = useSession();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [draft, setDraft] = useState("");

  const submit = () => {
    const content = draft.trim();
    if (!vendorId || !content) return;
    send.mutate(
      { vendorId, draft: { content, senderName: user?.name ?? "You" } },
      {
        onSuccess: () => {
          setOpen(false);
          setDraft("");
          setVendorId("");
          // Straight into the thread: the reason to send a first message is to watch for
          // the reply, and the inbox row alone does not show it.
          navigate(`/app/vendors/${vendorId}`);
        },
        onError: (error) => toast({ title: "Couldn't send", description: error.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={vendors.length === 0}>
          <PenSquare className="mr-1.5 size-3.5" />
          New message
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Message a vendor</DialogTitle>
          <DialogDescription>This starts a thread you can keep going from the vendor's page.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-message-vendor">Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="new-message-vendor">
                <SelectValue placeholder="Choose a vendor…" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name} · {vendor.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-message-body">Message</Label>
            <Textarea
              id="new-message-body"
              value={draft}
              onChange={(inputEvent) => setDraft(inputEvent.target.value)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" && (keyEvent.metaKey || keyEvent.ctrlKey)) {
                  keyEvent.preventDefault();
                  keyEvent.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Dates, headcount, budget and what you need from them…  (⌘↵ to send)"
              rows={5}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!vendorId || !draft.trim() || send.isPending}>
              <Send className="mr-1.5 size-3.5" />
              Send
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
        actions={<NewMessageDialog vendors={vendors ?? []} />}
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
            description={
              (vendors ?? []).length === 0
                ? "Add a vendor first, then you can message them from here."
                : "Send a vendor a brief and replies will collect here."
            }
            action={
              (vendors ?? []).length === 0 ? (
                <Button asChild size="sm">
                  <Link href="/app/vendors/new">Add a vendor</Link>
                </Button>
              ) : (
                <NewMessageDialog vendors={vendors ?? []} />
              )
            }
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
