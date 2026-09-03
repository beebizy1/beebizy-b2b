/**
 * The planning interview.
 *
 * Bee asks one thing at a time until it knows the event type, headcount, budget and
 * feel. At that point it hands the brief up and the existing planner does the drafting —
 * the conversation gathers, it does not generate.
 *
 * The transcript lives here rather than on the server, so every turn sends the whole
 * conversation. That keeps the API stateless and means a reload loses the chat rather
 * than resuming half of one.
 */

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/primitives";
import { formatMoney } from "@/data/money";
import { useAssistantChat } from "@/data/hooks";
import { ASSISTANT_OPENER, type AssistantChatMessage, type PartialBrief } from "@/data/assistantChat";

const OPENING: AssistantChatMessage = { role: "assistant", content: ASSISTANT_OPENER };

/** What the interview still needs, so the progress is visible rather than guessed at. */
function Progress({ collected }: { collected: PartialBrief }) {
  const steps: Array<[string, string | null]> = [
    ["Event", collected.eventType],
    ["People", collected.headcount == null ? null : String(collected.headcount)],
    ["Budget", collected.totalBudgetCents == null ? null : formatMoney(collected.totalBudgetCents)],
    ["Feel", collected.theme],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {steps.map(([label, value]) => (
        <Pill key={label} tone={value ? "success" : "neutral"}>
          {label}
          {value ? `: ${value}` : ""}
        </Pill>
      ))}
    </div>
  );
}

export default function PlanningChat({
  eventId,
  onBrief,
}: {
  eventId: string;
  /** Fired once, when the interview has everything the planner needs. */
  onBrief: (brief: { headcount: number; totalBudgetCents: number; theme: string }) => void;
}) {
  const chat = useAssistantChat();
  const [messages, setMessages] = useState<AssistantChatMessage[]>([OPENING]);
  const [collected, setCollected] = useState<PartialBrief>({
    eventType: null,
    headcount: null,
    totalBudgetCents: null,
    theme: null,
  });
  const [draft, setDraft] = useState("");
  const [handedOff, setHandedOff] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view without yanking the whole page around.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, chat.isPending]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || chat.isPending) return;

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");

    chat.mutate(
      // The opener is ours, not something they said, so it is not sent back as history.
      { eventId, messages: next.filter((message) => message !== OPENING) },
      {
        onSuccess: (turn) => {
          setMessages((current) => [...current, { role: "assistant", content: turn.reply }]);
          setCollected(turn.collected);
          if (turn.brief && !handedOff) {
            setHandedOff(true);
            onBrief(turn.brief);
          }
        },
        onError: (error) => {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content: `Sorry — I couldn't reach the planner just then (${error.message}). Try that again, or fill the brief in below.`,
            },
          ]);
        },
      },
    );
  };

  const restart = () => {
    setMessages([OPENING]);
    setCollected({ eventType: null, headcount: null, totalBudgetCents: null, theme: null });
    setDraft("");
    setHandedOff(false);
  };

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <Progress collected={collected} />
        {messages.length > 1 ? (
          <Button variant="ghost" size="sm" onClick={restart}>
            <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
            Start over
          </Button>
        ) : null}
      </div>

      <div
        ref={scroller}
        className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-hairline bg-surface-sunken p-4"
        role="log"
        aria-live="polite"
        aria-label="Planning conversation"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}
          >
            {message.role === "assistant" ? (
              <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </span>
            ) : null}
            <p
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                message.role === "user"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-surface text-foreground shadow-xs",
              )}
            >
              {message.content}
            </p>
          </div>
        ))}

        {chat.isPending ? (
          <div className="flex gap-2">
            <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" aria-hidden="true" />
            </span>
            <p className="flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2 text-sm text-muted-foreground shadow-xs">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Thinking…
            </p>
          </div>
        ) : null}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          send(draft);
        }}
      >
        <Input
          value={draft}
          onChange={(inputEvent) => setDraft(inputEvent.target.value)}
          placeholder={handedOff ? "Ask for a change, or edit the brief below…" : "Type your answer…"}
          aria-label="Message Bee"
          disabled={chat.isPending}
          className="flex-1"
        />
        <Button type="submit" disabled={!draft.trim() || chat.isPending}>
          <CornerDownLeft className="mr-1.5 size-4" aria-hidden="true" />
          Send
        </Button>
      </form>

      {messages.length === 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {["A gala for 300", "A conference for 450", "A team offsite for 40"].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => send(suggestion)}
              className="rounded-full border border-hairline px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
