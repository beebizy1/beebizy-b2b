/**
 * Grouped horizontal bar comparison.
 *
 * Built in plain HTML rather than pulling recharts in for one chart — that dependency
 * costs ~100KB gzipped and this needs a scale, two rows of bars and a tooltip.
 *
 * Rules it holds to, because they are the ones charts usually break:
 *  - One axis. Both series are money in the same unit, so they share a scale. Two
 *    y-scales on one chart is the mistake that makes every comparison a lie.
 *  - Colour follows the series, never its rank, and comes from the validated
 *    `--chart-*` categorical ramp in fixed order.
 *  - Identity is never colour alone: a legend is always present, and the tooltip names
 *    the series in text.
 *  - Values are not printed on every bar. The exact numbers live in the table below;
 *    the chart is for the shape of the comparison.
 *  - Text wears text tokens. A coloured swatch beside a label carries the identity;
 *    the label itself stays in normal ink.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface BarComparisonSeries {
  key: string;
  label: string;
  /** 1-based slot in the categorical ramp. */
  slot: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface BarComparisonRow {
  key: string;
  label: string;
  sublabel?: string;
  href?: string;
  /** Keyed by series key. */
  values: Record<string, number>;
}

const SLOT_BG: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
  6: "bg-chart-6",
};

/** Rounds a maximum up to a readable axis top: 1, 2, 2.5 or 5 × a power of ten. */
function axisTop(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (max <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

export function BarComparison({
  series,
  rows,
  format,
  emptyMessage = "Nothing to plot yet.",
  className,
}: {
  series: BarComparisonSeries[];
  rows: BarComparisonRow[];
  /** Formats a value for ticks and tooltips. */
  format: (value: number) => string;
  emptyMessage?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<{ row: string; series: string } | null>(null);

  const max = Math.max(0, ...rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0)));
  const top = axisTop(max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * top);

  if (rows.length === 0) {
    return <p className={cn("px-5 py-8 text-center text-sm text-muted-foreground", className)}>{emptyMessage}</p>;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Legend: always present for two or more series, so identity never rests on colour. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className={cn("size-2.5 rounded-sm", SLOT_BG[s.slot])} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="relative">
        {/* Recessive gridlines and a top scale. */}
        <div className="pointer-events-none absolute inset-y-0 left-[40%] right-0 flex justify-between">
          {ticks.map((tick, index) => (
            <span key={tick} className={cn("w-px bg-hairline", index === 0 && "bg-border")} />
          ))}
        </div>

        <div className="mb-1.5 flex text-[10px] text-muted-foreground">
          <span className="w-[40%]" />
          <span className="flex flex-1 justify-between">
            {ticks.map((tick) => (
              <span key={tick} data-numeric className="-translate-x-1/2 first:translate-x-0 last:translate-x-0">
                {format(tick)}
              </span>
            ))}
          </span>
        </div>

        <ul className="relative space-y-3">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3">
              <div className="w-[40%] min-w-0 pr-3">
                <p className="truncate text-xs font-medium text-foreground" title={row.label}>
                  {row.label}
                </p>
                {row.sublabel ? <p className="truncate text-[10px] text-muted-foreground">{row.sublabel}</p> : null}
              </div>

              {/* 2px gap between the two bars keeps adjacent fills from reading as one. */}
              <div className="flex flex-1 flex-col gap-0.5">
                {series.map((s) => {
                  const value = row.values[s.key] ?? 0;
                  const width = top > 0 ? Math.max(value > 0 ? 0.5 : 0, (value / top) * 100) : 0;
                  const isHovered = hover?.row === row.key && hover.series === s.key;
                  return (
                    <div
                      key={s.key}
                      className="group/bar relative h-2.5"
                      onMouseEnter={() => setHover({ row: row.key, series: s.key })}
                      onMouseLeave={() => setHover(null)}
                    >
                      <div
                        // Anchored to the baseline at the left, rounded only at the data end.
                        className={cn(
                          "h-full rounded-r-sm transition-[width,filter] duration-500",
                          SLOT_BG[s.slot],
                          isHovered && "brightness-110",
                        )}
                        style={{ width: `${width}%` }}
                      />
                      {isHovered ? (
                        <div
                          role="tooltip"
                          className={cn(
                            "absolute -top-1 z-10 max-w-[min(22rem,60vw)] -translate-y-full truncate rounded-md border border-popover-border bg-popover px-2.5 py-1.5 text-xs shadow-md",
                            // Past the midpoint the tooltip grows leftward, otherwise a long
                            // bar pushes it off the panel entirely.
                            width > 55 ? "-translate-x-full" : "",
                          )}
                          style={{ left: `${Math.min(width, 100)}%` }}
                        >
                          <span className="font-semibold text-popover-foreground">{row.label}</span>
                          <span className="mx-1.5 text-muted-foreground">·</span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn("size-2 rounded-sm", SLOT_BG[s.slot])} aria-hidden="true" />
                            <span className="text-muted-foreground">{s.label}</span>
                          </span>
                          <span data-numeric className="ml-1.5 font-semibold text-popover-foreground">
                            {format(value)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
