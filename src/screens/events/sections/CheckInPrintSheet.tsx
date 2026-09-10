import type { Preferences } from "@/app/preferences";
import type { Event, RegistrationWithGuest } from "@/data/entities";

export type CheckInPrintJob =
  | { kind: "guest-list" }
  | { kind: "badge"; row: RegistrationWithGuest };

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

  return (
    <section className="check-in-print-area" aria-hidden="true">
      {job.kind === "badge" ? (
        <div className="check-in-badge">
          <div className="check-in-badge-brand"><span />beebizy</div>
          <p className="check-in-badge-event">{event.title}</p>
          <h1>{job.row.guest?.name ?? "Guest"}</h1>
          {job.row.organization ? <p className="check-in-badge-organization">{job.row.organization}</p> : null}
          {job.row.segment ? <p className="check-in-badge-role">{job.row.segment}</p> : null}
          <footer>
            <span>{formatDate(event.date, "dayMonth")}</span>
            <span>{event.locationRecord?.name ?? event.location ?? ""}</span>
          </footer>
        </div>
      ) : (
        <div className="check-in-guest-list">
          <header>
            <div>
              <p className="check-in-print-kicker">BEEBIZY EVENT CHECK-IN</p>
              <h1>{event.title}</h1>
              <p>{formatDate(event.date, "full")} · {event.locationRecord?.name ?? event.location ?? "Location not set"}</p>
            </div>
            <div className="check-in-print-total">
              <strong>{rows.length}</strong>
              <span>registrations</span>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Guest</th>
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
      )}
    </section>
  );
}
