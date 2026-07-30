import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListConversations,
  useListVendorMessages,
  useSendVendorMessage,
  useMarkVendorMessagesRead,
  useListVendors,
  getListConversationsQueryKey,
  getListVendorMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format, isToday, isYesterday } from "date-fns";
import { Send, MessageSquare, Search, Store, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/QueryError";

function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

interface Conversation {
  vendorId: string;
  vendorName: string;
  vendorCategory: string;
  lastMessage: string;
  lastMessageAt?: string;
  lastDirection?: string;
  unreadCount: number;
}

interface Message {
  id: string;
  vendorId: string;
  direction: string;
  senderName: string;
  subject?: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
  eventId?: string | null;
}

export default function MessagesPage() {
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showNewConvo, setShowNewConvo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: conversations = [], isError: convosIsError, error: convosError } = useListConversations();
  const { data: vendors = [], isError: vendorsIsError, error: vendorsError } = useListVendors();
  const { data: messages = [] } = useListVendorMessages(selectedVendorId!, {
    query: { enabled: !!selectedVendorId, queryKey: getListVendorMessagesQueryKey(selectedVendorId!) },
  });
  const sendMessage = useSendVendorMessage();
  const markRead = useMarkVendorMessagesRead();

  const selectedConvo = (conversations as Conversation[]).find((c) => c.vendorId === selectedVendorId);
  const selectedVendorFromList = vendors.find((v) => v.id === selectedVendorId);

  const filteredConversations = (conversations as Conversation[]).filter((c) =>
    c.vendorName.toLowerCase().includes(search.toLowerCase())
  );

  const vendorsWithoutConvo = vendors.filter(
    (v) => !(conversations as Conversation[]).find((c) => c.vendorId === v.id)
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedVendorId) {
      markRead.mutate(
        { id: selectedVendorId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          },
        }
      );
    }
  }, [selectedVendorId]);

  const handleSelectVendor = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setShowNewConvo(false);
  };

  const handleSend = () => {
    if (!messageText.trim() || !selectedVendorId) return;
    sendMessage.mutate(
      {
        id: selectedVendorId,
        data: { content: messageText.trim(), senderName: "You" },
      },
      {
        onSuccess: () => {
          setMessageText("");
          queryClient.invalidateQueries({ queryKey: getListVendorMessagesQueryKey(selectedVendorId!) });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
        onError: () => {
          toast({ title: "Failed to send message", variant: "destructive" });
        },
      }
    );
  };

  const totalUnread = (conversations as Conversation[]).reduce((n, c) => n + c.unreadCount, 0);

  return (
    <AppLayout>
      <div className="flex h-screen overflow-hidden">
        {/* Left panel */}
        <div className="w-80 border-r border-border flex flex-col bg-background shrink-0">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-base font-semibold">Messages</h1>
                {totalUnread > 0 && (
                  <p className="text-xs text-muted-foreground">{totalUnread} unread</p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => { setShowNewConvo(true); setSelectedVendorId(null); }}
              >
                New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendors..."
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {(convosIsError || vendorsIsError) && (
              <QueryError error={convosIsError ? convosError : vendorsError} label="Failed to load conversations." />
            )}
            {filteredConversations.length === 0 && !showNewConvo && !convosIsError && !vendorsIsError && (
              <div className="p-6 text-center text-muted-foreground text-sm">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No conversations yet.</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 text-xs"
                  onClick={() => setShowNewConvo(true)}
                >
                  Start one
                </Button>
              </div>
            )}
            {filteredConversations.map((c: Conversation) => (
              <button
                key={c.vendorId}
                onClick={() => handleSelectVendor(c.vendorId)}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/40 transition-colors flex gap-3 items-start ${
                  selectedVendorId === c.vendorId ? "bg-muted/60" : ""
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
                  {c.vendorName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-sm truncate">{c.vendorName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {c.lastMessageAt ? formatMsgTime(c.lastMessageAt) : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {c.lastDirection === "outbound" && <span className="text-foreground/60">You: </span>}
                      {c.lastMessage}
                    </p>
                    {c.unreadCount > 0 && (
                      <Badge className="h-4 min-w-4 px-1 text-[10px] shrink-0">{c.unreadCount}</Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{c.vendorCategory}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showNewConvo ? (
            <div className="flex-1 flex flex-col p-8">
              <h2 className="text-lg font-semibold mb-2">New Conversation</h2>
              <p className="text-sm text-muted-foreground mb-6">Choose a vendor to start messaging.</p>
              <div className="grid gap-2">
                {vendorsWithoutConvo.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVendor(v.id)}
                    className="flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/40 hover:border-primary/30 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {v.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{v.name}</div>
                      <div className="text-xs text-muted-foreground">{v.category}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
                {vendorsWithoutConvo.length === 0 && (conversations as Conversation[]).length > 0 && (
                  <p className="text-sm text-muted-foreground">All your vendors have active conversations.</p>
                )}
                {vendors.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Store className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No vendors yet. Add vendors first to start messaging.</p>
                  </div>
                )}
              </div>
            </div>
          ) : selectedVendorId ? (
            <>
              {/* Thread header */}
              <div className="border-b border-border px-6 py-4 flex items-center gap-3 bg-background">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                  {(selectedConvo?.vendorName ?? selectedVendorFromList?.name ?? "?").charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-sm">
                    {selectedConvo?.vendorName ?? selectedVendorFromList?.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedConvo?.vendorCategory ?? selectedVendorFromList?.category}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {(messages as Message[]).length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
                    <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No messages yet</p>
                    <p className="text-xs mt-1">Send your first message below</p>
                  </div>
                ) : (
                  (messages as Message[]).map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[70%] ${msg.direction === "outbound" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                        {msg.subject && (
                          <p className="text-[10px] text-muted-foreground px-1">{msg.subject}</p>
                        )}
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            msg.direction === "outbound"
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm"
                          }`}
                        >
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-muted-foreground px-1">
                          {msg.direction === "inbound" ? msg.senderName + " · " : ""}
                          {format(new Date(msg.createdAt), "h:mm a")}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Compose */}
              <div className="border-t border-border p-4 bg-background">
                <div className="flex gap-3 items-end">
                  <Textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={`Message ${selectedConvo?.vendorName ?? selectedVendorFromList?.name ?? "vendor"}...`}
                    className="min-h-[44px] max-h-32 resize-none text-sm"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!messageText.trim() || sendMessage.isPending}
                    size="icon"
                    className="shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 px-1">Press Enter to send, Shift+Enter for new line</p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Vendor Messaging Hub</h2>
              <p className="text-sm max-w-sm">
                All vendor communication in one place. No more scattered emails or side chats.
              </p>
              <Button
                className="mt-6 gap-2"
                onClick={() => setShowNewConvo(true)}
              >
                <MessageSquare className="w-4 h-4" />
                Start a Conversation
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
