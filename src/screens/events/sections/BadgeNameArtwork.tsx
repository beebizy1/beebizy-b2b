import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { BadgeNameLayout } from "./badgeNameLayout";

const AVAILABLE_NAME_WIDTH_POINTS = 249;
const AVERAGE_BOLD_CHARACTER_WIDTH = 0.58;

function badgeNameFontSizePoints(layout: BadgeNameLayout): number {
  const maxLineLength = Math.max(layout.line1.trim().length, layout.line2.trim().length, 1);
  return Math.max(5, Math.min(36, Math.floor(AVAILABLE_NAME_WIDTH_POINTS / (maxLineLength * AVERAGE_BOLD_CHARACTER_WIDTH))));
}

export function BadgeNameArtwork({ layout, className }: { layout: BadgeNameLayout; className?: string }) {
  const lines = [layout.line1, layout.line2].map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const style = { fontSize: `${badgeNameFontSizePoints(layout)}pt` } satisfies CSSProperties;

  return (
    <div className={cn("check-in-badge-artwork", className)} style={style}>
      {lines.map((line, index) => <span key={`${index}-${line}`} className="check-in-badge-line">{line}</span>)}
    </div>
  );
}
