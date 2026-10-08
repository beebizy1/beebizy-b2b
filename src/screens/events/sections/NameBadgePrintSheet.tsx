import { createPortal } from "react-dom";
import { suggestBadgeNameLayout, type BadgeNameLayout } from "./badgeNameLayout";
import { BadgeNameArtwork } from "./BadgeNameArtwork";

/** One centered name, with an optional volunteer-controlled line break, for the 62 mm Brother roll. */
export function NameBadgePrintSheet({ name, layout }: { name?: string | null; layout?: BadgeNameLayout | null }) {
  const suggested = layout ?? (name ? suggestBadgeNameLayout(name) : null);
  if (!suggested) return null;
  const sheet = (
    <section className="check-in-print-area" aria-hidden="true">
      <style>{"@page { size: 62mm 100mm; margin: 0; }"}</style>
      <div className="check-in-badge">
        <BadgeNameArtwork layout={suggested} />
      </div>
    </section>
  );
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}
