import { ArrowLeft, Check, Lock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EVENT_LAUNCH_STEP_IDS, visibleEventLaunchStepIds, type EventLaunchCompletion, type EventLaunchStepId } from "@/data/eventLaunchGuide";
import { useMe } from "@/data/hooks";
import { workspaceUsesStripeConnect } from "@/data/workspaceAccess";

const STEPS = [
  "Event",
  "Guest list",
  "Invitation",
  "Tickets",
  "Payments",
  "Send",
] as const;

export default function EventLaunchContextBar({
  activeStep,
  eventTitle,
  backHref,
  onBack,
  completion,
  unlocked,
  onStepSelect,
}: {
  activeStep: number;
  eventTitle: string;
  backHref?: string;
  onBack?: () => void;
  completion?: EventLaunchCompletion;
  unlocked?: EventLaunchCompletion;
  onStepSelect?: (step: EventLaunchStepId) => void;
}) {
  const { data: identity, isLoading: identityLoading } = useMe();
  if (identityLoading) {
    return (
      <section aria-label="Loading event launch progress" className="sticky top-3 z-20 rounded-2xl border border-primary/30 bg-card p-5 shadow-md">
        <span className="text-sm font-medium text-muted-foreground">Loading launch steps…</span>
      </section>
    );
  }
  const visibleStepIds = visibleEventLaunchStepIds(!workspaceUsesStripeConnect(identity?.access));
  const activeStepId = EVENT_LAUNCH_STEP_IDS[activeStep - 1];
  const visibleActiveStep = Math.max(1, visibleStepIds.indexOf(activeStepId) + 1);
  const backContent = (
    <>
      <ArrowLeft className="mr-1.5 size-3.5" aria-hidden="true" />
      Master checklist
    </>
  );

  return (
    <section aria-label="Event launch progress" className="sticky top-3 z-20 overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-md">
      <div className="flex flex-col gap-3 border-b border-hairline bg-primary-muted/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-text">Launch your event</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{eventTitle} · Step {visibleActiveStep} of {visibleStepIds.length}</p>
        </div>
        {backHref ? (
          <Button asChild variant="outline" size="sm" className="shrink-0 bg-background">
            <Link href={backHref}>{backContent}</Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={onBack}>
            {backContent}
          </Button>
        )}
      </div>
      <ol className={cn("workspace-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:grid sm:px-5", visibleStepIds.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-6")}>
        {visibleStepIds.map((id, index) => {
          const originalIndex = EVENT_LAUNCH_STEP_IDS.indexOf(id);
          const label = STEPS[originalIndex]!;
          const number = index + 1;
          const current = id === activeStepId;
          const complete = completion?.[id] ?? originalIndex < activeStep - 1;
          const available = unlocked?.[id] ?? originalIndex < activeStep;
          const content = (
            <>
              <span className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                complete && "border-success bg-success text-white",
                current && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                !complete && !current && available && "border-hairline bg-background text-muted-foreground",
                !available && "border-hairline bg-surface-sunken text-muted-foreground",
              )}>
                {complete && !current ? <Check className="size-3.5" aria-hidden="true" /> : !available ? <Lock className="size-3" aria-hidden="true" /> : number}
              </span>
              <span className={cn("text-xs font-medium", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            </>
          );
          return (
            <li key={id} className="min-w-28 sm:min-w-0">
              {onStepSelect ? (
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  aria-label={`Step ${number}: ${label}${complete ? ", complete" : !available ? ", locked" : ""}`}
                  title={!available ? "Finish the earlier steps to unlock this one." : current ? "You are here" : `Go to ${label}`}
                  disabled={!available || current}
                  className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors enabled:hover:bg-primary-muted/50 disabled:cursor-default"
                  onClick={() => onStepSelect(id)}
                >
                  {content}
                </button>
              ) : (
                <div aria-current={current ? "step" : undefined} className="flex items-center gap-2 p-1.5">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
