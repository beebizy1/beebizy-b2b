import { Input } from "@/components/ui/input";
import { BadgeNameArtwork } from "./BadgeNameArtwork";
import { badgeNameLayoutMatchesOriginal, type BadgeNameLayout } from "./badgeNameLayout";

export function BadgeNameLayoutFields({
  originalName,
  layout,
  onChange,
}: {
  originalName: string;
  layout: BadgeNameLayout;
  onChange: (layout: BadgeNameLayout) => void;
}) {
  const matchesOriginal = badgeNameLayoutMatchesOriginal(layout, originalName);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-foreground">
          Line 1
          <Input
            autoFocus
            value={layout.line1}
            onChange={(event) => onChange({ ...layout, line1: event.target.value })}
            maxLength={80}
            className="mt-1"
          />
        </label>
        <label className="text-sm font-medium text-foreground">
          Line 2 <span className="font-normal text-muted-foreground">(optional)</span>
          <Input
            value={layout.line2}
            onChange={(event) => onChange({ ...layout, line2: event.target.value })}
            maxLength={80}
            className="mt-1"
          />
        </label>
      </div>
      <div className="badge-name-preview aspect-[100/62] overflow-hidden rounded-xl border border-dashed border-hairline bg-background p-4 text-brand-ink shadow-inner" aria-label="Badge preview">
        <BadgeNameArtwork layout={layout} />
      </div>
      <div className="space-y-1 text-xs">
        <p className="text-muted-foreground">Original guest name: {originalName}</p>
        {!matchesOriginal ? (
          <p role="alert" className="font-medium text-danger-text">Keep every name and punctuation mark. You may correct capitalization or move whole words between the lines.</p>
        ) : null}
      </div>
    </div>
  );
}
