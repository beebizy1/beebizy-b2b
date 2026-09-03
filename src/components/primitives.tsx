/**
 * The shared visual vocabulary.
 *
 * Every screen composes these instead of re-inventing a header, a metric or an empty
 * state — which is how the old build ended up with four different card paddings and
 * three different ways of saying "nothing here yet". Tokens only: no raw palette
 * classes, so all of it works in both themes.
 */

import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookingStatus, EventStatus, RegistrationStatus, RiskLevel } from "@/data/entities";

/* ---------------------------------------------------------------- page header */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {/* An eyebrow is the exception, not the pattern: the planning workspace uses one,
            the table screens lead with the title alone. Amber, not grey micro-caps. */}
        {eyebrow ? <p className="text-base font-medium text-primary-text">{eyebrow}</p> : null}
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="max-w-2xl leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* ------------------------------------------------------------------ surfaces */

export function Panel({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-xl border border-card-border bg-card text-card-foreground shadow-xs", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4", className)}>
      <div className="min-w-0 space-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- metrics */

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  brand: "text-foreground",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
  info: "text-info-text",
};

const TONE_ICON_BG: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-primary-muted text-foreground",
  success: "bg-success-tint text-success-text",
  warning: "bg-warning-tint text-warning-text",
  danger: "bg-danger-tint text-danger-text",
  info: "bg-info-tint text-info-text",
};

export function StatTile({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "neutral",
  loading = false,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("grid size-7 place-items-center rounded-md", TONE_ICON_BG[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p data-numeric className={cn("mt-1.5 text-2xl font-bold tracking-tight", TONE_TEXT[tone])}>
          {value}
        </p>
      )}
      {sublabel ? <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p> : null}
    </Panel>
  );
}

/** Labelled progress bar. `tone` carries the meaning; the number carries the detail. */
export function Meter({
  value,
  max = 100,
  tone = "brand",
  label,
  caption,
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  label?: ReactNode;
  caption?: ReactNode;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const barTone: Record<Tone, string> = {
    neutral: "bg-muted-foreground",
    brand: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  };
  return (
    <div className={cn("space-y-1.5", className)}>
      {label || caption ? (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          {label ? <span className="font-medium text-foreground">{label}</span> : null}
          {caption ? (
            <span data-numeric className="text-muted-foreground">
              {caption}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", barTone[tone])} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * Readiness gauge. A ring rather than a bar because it sits beside an event title and
 * needs to read as a single glanceable score.
 */
export function ReadinessRing({ value, size = 56, label }: { value: number; size?: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = Math.max(4, Math.round(size * 0.1));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone: Tone = clamped >= 80 ? "success" : clamped >= 50 ? "warning" : "danger";
  const strokeClass: Record<Tone, string> = {
    neutral: "stroke-muted-foreground",
    brand: "stroke-primary",
    success: "stroke-success",
    warning: "stroke-warning",
    danger: "stroke-danger",
    info: "stroke-info",
  };
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ?? "Readiness"}: ${clamped} percent`}
        className="-rotate-90"
      >
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-surface-sunken" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700", strokeClass[tone])}
        />
      </svg>
      <span data-numeric className="text-xs font-semibold text-foreground">
        {clamped}%
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------- badges */

const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap";

const BADGE_TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-primary-muted text-foreground",
  success: "bg-success-tint text-success-text",
  warning: "bg-warning-tint text-warning-text",
  danger: "bg-danger-tint text-danger-text",
  info: "bg-info-tint text-info-text",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn(BADGE_BASE, BADGE_TONE[tone], className)}>{children}</span>;
}

const EVENT_STATUS_TONE: Record<EventStatus, Tone> = {
  draft: "neutral",
  published: "success",
  cancelled: "danger",
  completed: "info",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <Pill tone={EVENT_STATUS_TONE[status]}>{status}</Pill>;
}

const BOOKING_TONE: Record<BookingStatus, Tone> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "danger",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Pill tone={BOOKING_TONE[status]}>{status}</Pill>;
}

const REGISTRATION_TONE: Record<RegistrationStatus, Tone> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "neutral",
};

export function RegistrationStatusBadge({ status }: { status: RegistrationStatus }) {
  return <Pill tone={REGISTRATION_TONE[status]}>{status}</Pill>;
}

const RISK_TONE: Record<RiskLevel, Tone> = { urgent: "danger", watch: "warning", clear: "success" };
const RISK_ICON: Record<RiskLevel, LucideIcon> = { urgent: AlertTriangle, watch: Info, clear: CheckCircle2 };

export function RiskPill({ level, children }: { level: RiskLevel; children?: ReactNode }) {
  const Icon = RISK_ICON[level];
  return (
    <Pill tone={RISK_TONE[level]}>
      <Icon className="size-3" aria-hidden="true" />
      {children ?? level}
    </Pill>
  );
}

/* ------------------------------------------------------------- empty & error */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      {Icon ? (
        <span className="grid size-11 place-items-center rounded-xl bg-surface-sunken text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Error surface that shows the actual message. The old build swallowed Firestore
 * errors into "Something went wrong", which made permission and index failures
 * indistinguishable.
 */
export function ErrorNotice({
  error,
  title = "That didn't load",
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return (
    <div className={cn("rounded-xl border border-danger/30 bg-danger-tint px-4 py-3", className)} role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-danger-text">{title}</p>
          <p className="break-words text-sm text-danger-text/90">{message}</p>
        </div>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
            <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- misc helpers */

/** Definition row used in detail panels. */
export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

/** Neutral separator label for grouping rows inside a panel. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="bg-surface-sunken px-5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}
