import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useFeedback, useSubmitFeedback } from "@/data/hooks";
import {
  DEFAULT_FEEDBACK_CATEGORY,
  FEEDBACK_CATEGORIES,
  FEEDBACK_LIMITS,
  type FeedbackCategory,
} from "@/data/entities";
import { useSession } from "@/app/session";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  general: "General",
  bug: "Something broke",
  idea: "I have an idea",
  praise: "Something worked well",
};

interface FeedbackBotProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackBot({ userId, open, onOpenChange }: FeedbackBotProps) {
  const { user } = useSession();
  const { data: feedback = [], isLoading } = useFeedback(userId);
  const submit = useSubmitFeedback(userId);
  const [category, setCategory] = useState<FeedbackCategory>(DEFAULT_FEEDBACK_CATEGORY);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const promptKey = `beebizy:feedback-prompt:${userId}`;
    if (window.sessionStorage.getItem(promptKey)) return;
    window.sessionStorage.setItem(promptKey, "shown");
    onOpenChange(true);
  }, [onOpenChange, userId]);

  const recentFeedback = useMemo(() => feedback.slice(0, 4).reverse(), [feedback]);
  const firstName = user?.name.trim().split(/\s+/)[0] || "there";
  const canSubmit = message.trim().length >= FEEDBACK_LIMITS.minMessageLength && !submit.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!canSubmit) return;
    setSaved(false);
    submit.mutate(
      { category, message: trimmed, pagePath: window.location.pathname },
      {
        onSuccess: () => {
          setMessage("");
          setCategory(DEFAULT_FEEDBACK_CATEGORY);
          setSaved(true);
        },
      },
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            className="h-12 rounded-full px-4 shadow-lg"
            aria-label={open ? "Close feedback chat" : "Open feedback chat"}
          >
            <MessageCircle className="size-5" aria-hidden="true" />
            <span className="hidden sm:inline">Share feedback</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-card-border bg-card p-0 shadow-2xl sm:w-[25rem]"
        >
          <div className="flex items-start gap-3 border-b border-border bg-primary/10 px-4 py-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-foreground">Bee feedback</h2>
              <p className="text-xs text-muted-foreground">Your notes are saved to your Beebizy account.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-1 size-8"
              onClick={() => onOpenChange(false)}
              aria-label="Close feedback chat"
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <ScrollArea className="h-64 border-b border-border">
            <div className="space-y-3 p-4" aria-live="polite">
              <div className="mr-8 rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
                Hi {firstName}! How is Beebizy working for you? Tell me what feels useful, confusing, or missing.
              </div>

              {isLoading ? <p className="text-xs text-muted-foreground">Loading your previous notes…</p> : null}

              {recentFeedback.map((item) => (
                <div key={item.id} className="ml-8 rounded-2xl rounded-tr-sm bg-primary/15 px-3 py-2 text-sm text-foreground">
                  <p>{item.message}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABELS[item.category]} · Saved
                  </p>
                </div>
              ))}

              {saved ? (
                <div className="mr-8 flex items-start gap-2 rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <p>Thank you. I saved that for the Beebizy team. You can send another note anytime.</p>
                </div>
              ) : null}

              {submit.error ? (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {submit.error.message}
                </p>
              ) : null}
            </div>
          </ScrollArea>

          <form onSubmit={handleSubmit} className="space-y-3 p-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Feedback type">
              {FEEDBACK_CATEGORIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={category === option}
                  onClick={() => setCategory(option)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    category === option
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {CATEGORY_LABELS[option]}
                </button>
              ))}
            </div>

            <label htmlFor="feedback-message" className="sr-only">Your feedback</label>
            <div className="flex items-end gap-2">
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setSaved(false);
                }}
                maxLength={FEEDBACK_LIMITS.maxMessageLength}
                rows={2}
                className="min-h-16 resize-none bg-background"
                placeholder="Type your feedback…"
              />
              <Button
                type="submit"
                size="icon"
                className="shrink-0"
                disabled={!canSubmit}
                aria-label="Send feedback"
              >
                <Send aria-hidden="true" />
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
