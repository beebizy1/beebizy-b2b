import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNotice, LoadingRows, Panel, PanelHeader } from "@/components/primitives";
import { usePublicVendorConversation, useReplyToVendorConversation } from "@/data/hooks";
import { toast } from "@/hooks/use-toast";
import { PublicFrame } from "./PublicEvent";

export default function PublicVendorConversation({ token }: { token: string }) {
  const { data, isLoading, error, refetch } = usePublicVendorConversation(token);
  const reply = useReplyToVendorConversation();
  const [content, setContent] = useState("");
  return <PublicFrame>
    {isLoading ? <LoadingRows rows={4} /> : error ? <ErrorNotice error={error} onRetry={() => void refetch()} /> : !data ? (
      <Panel className="p-6"><h1 className="text-xl font-semibold">This conversation link is not active</h1><p>Ask the organizer to send you a new message.</p></Panel>
    ) : <Panel>
      <PanelHeader title={data.vendorName} description="Your private conversation with the event team. Keep this link private." />
      <ul className="max-h-[60vh] space-y-3 overflow-auto p-5" aria-label="Conversation">
        {data.messages.map((message) => <li key={message.id} className={message.direction === "inbound" ? "ml-8 rounded-xl bg-primary-muted p-4" : "mr-8 rounded-xl bg-surface-sunken p-4"}>
          <p className="text-xs font-semibold">{message.direction === "inbound" ? "You" : message.senderName}</p>
          {message.subject ? <p className="mt-1 font-semibold">{message.subject}</p> : null}
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.content}</p>
          <p className="mt-2 text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleString()}</p>
        </li>)}
      </ul>
      <form className="space-y-3 border-t border-hairline p-5" onSubmit={(event) => {
        event.preventDefault();
        reply.mutate({ token, content: content.trim() }, {
          onSuccess: () => { setContent(""); toast({ title: "Reply sent to the event team" }); },
          onError: (caught) => toast({ title: "Could not send", description: caught.message }),
        });
      }}>
        <Textarea aria-label="Your reply" value={content} onChange={(event) => setContent(event.target.value)} rows={4} maxLength={10_000} placeholder="Reply to the event team…" required />
        <Button disabled={!content.trim() || reply.isPending}>{reply.isPending ? "Sending…" : "Send reply"}</Button>
      </form>
    </Panel>}
  </PublicFrame>;
}
