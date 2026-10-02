import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, LockKeyhole, Printer, RefreshCw, RotateCcw, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorNotice, LoadingRows, Panel, Pill } from "@/components/primitives";
import type { PublicCheckInGuest, PublicCheckInStationPayload } from "@/data/entities";
import { lastNameSearchValue } from "@/data/checkInLanes";
import { resolveTimeZone } from "@/lib/datetime";
import { NameBadgePrintSheet } from "@/screens/events/sections/NameBadgePrintSheet";
import { PublicFrame } from "./PublicEvent";

function errorMessage(result: unknown, fallback: string): string {
  return result && typeof result === "object" && "error" in result && typeof result.error === "string"
    ? result.error
    : fallback;
}

export default function PublicCheckIn({ token }: { token: string }) {
  const [payload, setPayload] = useState<PublicCheckInStationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [inactive, setInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [printName, setPrintName] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/public/assignments/${encodeURIComponent(token)}/check-in`);
      const result: unknown = await response.json().catch(() => null);
      if (response.status === 404) {
        setPayload(null);
        setInactive(true);
        return;
      }
      if (!response.ok || !result || typeof result !== "object" || !("station" in result)) {
        throw new Error(errorMessage(result, "The counter list could not be loaded."));
      }
      setPayload(result as PublicCheckInStationPayload);
      setInactive(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The counter list could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // The token is the complete identity for this deliberately session-free screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!printName) return;
    const frame = window.requestAnimationFrame(() => {
      window.print();
      setPrintName(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [printName]);

  const visibleGuests = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!payload) return [];
    if (!needle) return payload.guests;
    return payload.guests.filter((guest) => [guest.name, lastNameSearchValue(guest.name), guest.organization, guest.segment]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(needle)));
  }, [payload, search]);

  const setCheckedIn = async (guest: PublicCheckInGuest, checkedIn: boolean, printAfter: boolean) => {
    if (savingId) return;
    setSavingId(guest.registrationId);
    setError(null);
    try {
      const response = await fetch(`/api/public/assignments/${encodeURIComponent(token)}/check-in/${encodeURIComponent(guest.registrationId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkedIn }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (response.status === 404) {
        await load();
        setError(errorMessage(result, "This guest is no longer available at this counter."));
        return;
      }
      if (!response.ok || !result || typeof result !== "object" || !("registrationId" in result)) {
        throw new Error(errorMessage(result, "The check-in could not be saved."));
      }
      const updated = result as PublicCheckInGuest;
      setPayload((current) => current ? {
        ...current,
        guests: current.guests.map((row) => row.registrationId === updated.registrationId ? updated : row),
      } : current);
      if (printAfter) setPrintName(updated.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The check-in could not be saved.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <PublicFrame><LoadingRows rows={5} /></PublicFrame>;
  if (error && !payload) {
    return <PublicFrame><Panel className="p-5"><ErrorNotice error={new Error(error)} title="Couldn't load this counter" onRetry={() => { setLoading(true); void load(); }} /></Panel></PublicFrame>;
  }
  if (inactive || !payload) {
    return (
      <PublicFrame>
        <Panel><EmptyState icon={LockKeyhole} title="This counter link is not active" description="The volunteer or counter assignment may have changed. Ask the event organizer for the current private link." /></Panel>
      </PublicFrame>
    );
  }

  const checkedIn = payload.guests.filter((guest) => guest.checkedInAt).length;
  const eventDate = new Date(payload.eventDate).toLocaleDateString("en-US", {
    dateStyle: "full",
    timeZone: resolveTimeZone(payload.timeZone),
  });

  return (
    <PublicFrame>
      <div className="space-y-5">
        <Panel className="overflow-hidden">
          <div className="border-b border-hairline bg-primary-muted/40 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Pill tone="brand">Private volunteer counter</Pill>
                <h1 className="mt-3 text-2xl font-bold text-foreground">{payload.station.name}</h1>
                <p className="mt-1 text-sm font-semibold text-foreground">{payload.station.lane}</p>
              </div>
              <div className="rounded-xl border border-hairline bg-card px-4 py-3 text-right">
                <p className="text-xs text-muted-foreground">Signed in as</p>
                <p className="font-semibold text-foreground">{payload.volunteer.name}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 p-5 text-sm sm:grid-cols-3 sm:p-6">
            <div><p className="text-xs text-muted-foreground">Event</p><p className="font-semibold text-foreground">{payload.eventTitle}</p></div>
            <div><p className="text-xs text-muted-foreground">Date</p><p className="font-semibold text-foreground">{eventDate}</p></div>
            <div><p className="text-xs text-muted-foreground">Progress</p><p className="font-semibold text-foreground">{checkedIn} of {payload.guests.length} checked in</p></div>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-hairline p-4 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search last name or full name"
                className="pl-9"
              />
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-1.5 size-3.5" />Refresh
            </Button>
          </div>

          {error ? <p role="alert" className="border-b border-danger/20 bg-danger-tint px-5 py-3 text-sm text-danger-text">{error}</p> : null}
          {payload.guests.length === 0 ? (
            <EmptyState icon={UserCheck} title="No guests are assigned to this range" description={`Only ${payload.station.lane.toLowerCase()} appear at this private counter.`} />
          ) : visibleGuests.length === 0 ? (
            <EmptyState icon={Search} title="No matching guest" description="Check the spelling or send the guest to the counter shown for their last name." />
          ) : (
            <ul className="divide-y divide-hairline">
              {visibleGuests.map((guest) => (
                <li key={guest.registrationId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{guest.name}</p>
                      {guest.checkedInAt ? <Pill tone="success">Checked in</Pill> : <Pill tone="warning">Expected</Pill>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{[guest.organization, guest.segment].filter(Boolean).join(" · ") || "No additional identifying details"}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {guest.checkedInAt ? (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={() => setPrintName(guest.name)}>
                          <Printer className="mr-1.5 size-3.5" />Reprint badge
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={savingId === guest.registrationId} onClick={() => void setCheckedIn(guest, false, false)}>
                          <RotateCcw className="mr-1.5 size-3.5" />Undo
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" disabled={savingId !== null} onClick={() => void setCheckedIn(guest, true, true)}>
                        {savingId === guest.registrationId ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-3.5" />}
                        {savingId === guest.registrationId ? "Saving…" : "Check in & print badge"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />This private link can only view and check in guests assigned to {payload.station.name}. It cannot open event settings, budgets, vendors, or other counters.
        </p>
      </div>
      <NameBadgePrintSheet name={printName} />
    </PublicFrame>
  );
}
