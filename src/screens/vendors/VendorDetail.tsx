/**
 * One vendor: their details and the conversation with them.
 *
 * Opening this marks the thread read, which is what clears the sidebar badge — the old
 * Messages page left `unreadCount` to drift because nothing ever wrote it back.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Globe, Mail, MapPin, Phone, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  ErrorNotice,
  KeyValue,
  LoadingRows,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/primitives";
import { useMarkThreadRead, useSendVendorMessage, useVendor, useVendorThread } from "@/data/hooks";
import { useSession } from "@/app/session";
import { MessageSquare } from "lucide-react";

function timestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function VendorDetail({ id }: { id: string }) {
  const { data: vendor, isLoading, isError, error, refetch } = useVendor(id);
  const { data: thread, isLoading: threadLoading } = useVendorThread(id);
  const send = useSendVendorMessage();
  const markRead = useMarkThreadRead();
  const { user } = useSession();
  const [draft, setDraft] = useState("");
  const markedFor = useRef<string | null>(null);

  // Mark read once per vendor, after the thread has actually loaded.
  useEffect(() => {
    if (!vendor || threadLoading) return;
    if (vendor.unreadCount === 0) return;
    if (markedFor.current === vendor.id) return;
    markedFor.current = vendor.id;
    markRead.mutate({ vendorId: vendor.id });
  }, [vendor, threadLoading, markRead]);

  if (isLoading) return <LoadingRows rows={5} />;
  if (isError) return <ErrorNotice error={error} title="Couldn't load this vendor" onRetry={() => void refetch()} />;

  if (!vendor) {
    return (
      <Panel className="p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">That vendor doesn't exist</h1>
        <Button asChild className="mt-4" size="sm">
          <Link href="/app/vendors">Back to vendors</Link>
        </Button>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/vendors"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All vendors
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="display-md text-foreground">{vendor.name}</h1>
            <Pill>{vendor.category}</Pill>
            {vendor.rating !== null ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" />
                <span data-numeric>{vendor.rating.toFixed(1)}</span>
              </span>
            ) : null}
          </div>
          {vendor.description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{vendor.description}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel className="flex min-h-[28rem] flex-col">
          <PanelHeader
            title="Conversation"
            description={thread?.length ? `${thread.length} messages` : "Nothing sent yet"}
          />

          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {threadLoading ? (
              <LoadingRows rows={3} />
            ) : (thread ?? []).length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No messages yet"
                description="Start the brief below. Replies show up here and as an unread badge in the sidebar."
              />
            ) : (
              (thread ?? []).map((message) => {
                const outbound = message.direction === "outbound";
                return (
                  <div key={message.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] space-y-1 rounded-xl px-3.5 py-2.5",
                        outbound
                          ? "bg-primary-muted text-foreground"
                          : "border border-hairline bg-surface text-foreground",
                      )}
                    >
                      {message.subject ? (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {message.subject}
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {outbound ? "You" : vendor.name} · {timestamp(message.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            className="flex items-end gap-2 border-t border-hairline p-4"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const trimmed = draft.trim();
              if (!trimmed) return;
              send.mutate(
                { vendorId: vendor.id, draft: { content: trimmed, senderName: user?.name ?? "You" } },
                {
                  onSuccess: () => setDraft(""),
                  onError: (mutationError) => toast({ title: "Couldn't send", description: mutationError.message }),
                },
              );
            }}
          >
            <Textarea
              value={draft}
              onChange={(inputEvent) => setDraft(inputEvent.target.value)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" && (keyEvent.metaKey || keyEvent.ctrlKey)) {
                  keyEvent.preventDefault();
                  keyEvent.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`Message ${vendor.name}…  (⌘↵ to send)`}
              aria-label={`Message ${vendor.name}`}
              rows={2}
              className="flex-1 resize-none"
            />
            <Button type="submit" disabled={!draft.trim() || send.isPending}>
              <Send className="size-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </Panel>

        <Panel>
          <PanelHeader title="Contact" />
          <dl className="divide-y divide-hairline px-5 py-2">
            <KeyValue label="Category">{vendor.category}</KeyValue>
            {vendor.contactEmail ? (
              <KeyValue label="Email">
                <a href={`mailto:${vendor.contactEmail}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <Mail className="size-3.5" aria-hidden="true" />
                  {vendor.contactEmail}
                </a>
              </KeyValue>
            ) : null}
            {vendor.contactPhone ? (
              <KeyValue label="Phone">
                <a href={`tel:${vendor.contactPhone}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <Phone className="size-3.5" aria-hidden="true" />
                  {vendor.contactPhone}
                </a>
              </KeyValue>
            ) : null}
            {vendor.website ? (
              <KeyValue label="Website">
                <a
                  href={vendor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <Globe className="size-3.5" aria-hidden="true" />
                  Visit
                </a>
              </KeyValue>
            ) : null}
            {vendor.city ? (
              <KeyValue label="Based in">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {[vendor.city, vendor.state, vendor.country].filter(Boolean).join(", ")}
                </span>
              </KeyValue>
            ) : null}
          </dl>
        </Panel>
      </div>
    </div>
  );
}
