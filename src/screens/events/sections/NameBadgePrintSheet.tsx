import { createPortal } from "react-dom";
import { suggestBadgeNameLayout, type BadgeNameLayout } from "./badgeNameLayout";

/** One centered name, with an optional volunteer-controlled line break, for the 62 mm Brother roll. */
export function NameBadgePrintSheet({ name, layout }: { name?: string | null; layout?: BadgeNameLayout | null }) {
  const suggested = layout ?? (name ? suggestBadgeNameLayout(name) : null);
  if (!suggested) return null;
  const lines = [suggested.line1, suggested.line2].map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const length = Math.max(...lines.map((line) => line.length));
  const sheet = (
    <section className="check-in-print-area" aria-hidden="true">
      <style>{"@page { size: 62mm 100mm; margin: 0; }"}</style>
      <div className="check-in-badge">
        <h1 className={length > 28 ? "check-in-badge-name-long" : length > 18 ? "check-in-badge-name-medium" : undefined}>
          {lines.map((line, index) => <span key={`${index}-${line}`} className="check-in-badge-line">{line}</span>)}
        </h1>
      </div>
    </section>
  );
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}
