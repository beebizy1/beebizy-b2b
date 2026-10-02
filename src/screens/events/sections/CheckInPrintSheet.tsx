import type { Preferences } from "@/app/preferences";
import type { Event, RegistrationWithGuest } from "@/data/entities";
import { createPortal } from "react-dom";
import { NameBadgePrintSheet } from "./NameBadgePrintSheet";

export type CheckInPrintJob =
  | { kind: "guest-list" }
  | { kind: "badge"; row: RegistrationWithGuest }
  | { kind: "printer-test"; name: string };

interface CheckInPrintSheetProps {
  event: Event;
  job: CheckInPrintJob | null;
  rows: RegistrationWithGuest[];
  formatDate: Preferences["date"];
  timeZoneLabel: string;
}

function attendance(row: RegistrationWithGuest, formatDate: Preferences["date"]): string {
  if (row.checkedInAt) return formatDate(row.checkedInAt, "time");
  if (row.status === "pending") return "Awaiting RSVP";
  return "Not arrived";
}

/** The only DOM exposed by the print stylesheet. Screen readers ignore the duplicate content. */
export function CheckInPrintSheet({ event, job, rows, formatDate, timeZoneLabel }: CheckInPrintSheetProps) {
  if (!job) return null;
  const badgeName = job.kind === "badge" ? job.row.guest?.name ?? "Guest" : job.kind === "printer-test" ? job.name : null;
  if (badgeName) return <NameBadgePrintSheet name={badgeName} />;

  const sheet = (
    <section className="check-in-print-area" aria-hidden="true">
      <style>{"@page { size: auto; margin: 0.35in; }"}</style>
      <div className="check-in-guest-list">
          <header>
            <div>
              <p className="check-in-print-kicker">BEEBIZY EVENT CHECK-IN</p>
              <h1>{event.title}</h1>
              <p>{formatDate(event.date, "full")} · {event.locationRecord?.name ?? event.location ?? "Location not set"}</p>
            </div>
            <div className="check-in-print-total">
              <strong>{rows.reduce((total, row) => total + row.quantity, 0)}</strong>
              <span>people</span>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Guest</th>
                <th>People</th>
                <th>Contact</th>
                <th>Group</th>
                <th>RSVP</th>
                <th>Arrival ({timeZoneLabel})</th>
                <th>Station</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.checkedInAt ? "[x]" : "[ ]"}</td>
                  <td>{row.guest?.name ?? "Deleted guest"}</td>
                  <td>{row.quantity}</td>
                  <td>{row.guest?.contact || "-"}</td>
                  <td>{[row.segment, row.organization].filter(Boolean).join(" · ") || "-"}</td>
                  <td>{row.status === "confirmed" ? "Confirmed" : "Pending"}</td>
                  <td>{attendance(row, formatDate)}</td>
                  <td>{row.checkInStation ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </section>
  );

  // Keep the printable sheet outside the application root. This lets the print
  // stylesheet remove the full app from layout instead of merely hiding it,
  // preventing empty pages before or after a single badge.
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}
