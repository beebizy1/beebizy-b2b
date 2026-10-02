import { createPortal } from "react-dom";

/** A single centered full name for the 62 mm Brother continuous label roll. */
export function NameBadgePrintSheet({ name }: { name: string | null }) {
  if (!name) return null;
  const length = name.length;
  const sheet = (
    <section className="check-in-print-area" aria-hidden="true">
      <style>{"@page { size: 62mm 100mm; margin: 0; }"}</style>
      <div className="check-in-badge">
        <h1 className={length > 28 ? "check-in-badge-name-long" : length > 18 ? "check-in-badge-name-medium" : undefined}>
          {name}
        </h1>
      </div>
    </section>
  );
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}
