import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LockKeyhole, PencilLine, Printer, RefreshCw, RotateCcw, Search, Trash2, UserCheck, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, ErrorNotice, LoadingRows, Panel, Pill } from "@/components/primitives";
import type { PublicCheckInGuest, PublicCheckInStationPayload } from "@/data/entities";
import { lastNameSearchValue } from "@/data/checkInLanes";
import { resolveTimeZone } from "@/lib/datetime";
import { NameBadgePrintSheet } from "@/screens/events/sections/NameBadgePrintSheet";
import { BadgeNameLayoutFields } from "@/screens/events/sections/BadgeNameLayoutFields";
import { badgeNameLayoutMatchesOriginal, suggestBadgeNameLayout, type BadgeNameLayout } from "@/screens/events/sections/badgeNameLayout";
import { PublicFrame } from "./PublicEvent";
import { printBadgeBeforeCompletion } from "./printBadgeFlow";
import { publicCheckInArrivalAction } from "./publicCheckInPolicy";

function errorMessage(result: unknown, fallback: string): string {
  return result && typeof result === "object" && "error" in result && typeof result.error === "string"
    ? result.error
    : fallback;
}

type BadgeEditorCompletion =
  | { kind: "print-only" }
  | { kind: "check-in"; guest: PublicCheckInGuest }
  | { kind: "create-walk-in" };

type PublicCheckInGuestActionsProps = {
  guest: PublicCheckInGuest;
  savingId: string | null;
  removingId: string | null;
  onPrint: (guest: PublicCheckInGuest, completion: BadgeEditorCompletion) => void;
  onEditBadge: (guest: PublicCheckInGuest, completion: BadgeEditorCompletion) => void;
  onSetCheckedIn: (guest: PublicCheckInGuest, checkedIn: boolean) => void | Promise<PublicCheckInGuest | null>;
  onRemove: (guest: PublicCheckInGuest) => void;
};

type BadgeEditorState = BadgeNameLayout & {
  name: string;
  completion: BadgeEditorCompletion;
};

export function PublicCheckInGuestActions({
  guest,
  savingId,
  removingId,
  onPrint,
  onEditBadge,
  onSetCheckedIn,
  onRemove,
}: PublicCheckInGuestActionsProps) {
  const arrivalAction = publicCheckInArrivalAction(guest);

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {guest.checkedInAt ? (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => onPrint(guest, { kind: "print-only" })}>
            <Printer className="mr-1.5 size-3.5" />Reprint badge
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onEditBadge(guest, { kind: "print-only" })}>
            <PencilLine className="mr-1.5 size-3.5" />Edit badge
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={savingId === guest.registrationId} onClick={() => void onSetCheckedIn(guest, false)}>
            <RotateCcw className="mr-1.5 size-3.5" />Undo
          </Button>
        </>
      ) : arrivalAction.kind === "check-in" ? (
        <>
          <Button type="button" size="sm" variant="outline" disabled={savingId !== null} onClick={() => onPrint(guest, { kind: "print-only" })}>
            <Printer className="mr-1.5 size-3.5" />Print badge
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={savingId !== null} onClick={() => onEditBadge(guest, { kind: "print-only" })}>
            <PencilLine className="mr-1.5 size-3.5" />Edit badge
          </Button>
          <Button type="button" size="sm" disabled={savingId !== null} onClick={() => void onSetCheckedIn(guest, true)}>
            {savingId === guest.registrationId ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <UserCheck className="mr-1.5 size-3.5" />}
            {savingId === guest.registrationId ? "Saving…" : "Check in"}
          </Button>
        </>
      ) : (
        <>
          <Button type="button" size="sm" disabled={savingId !== null} onClick={() => onPrint(guest, { kind: "check-in", guest })}>
            {savingId === guest.registrationId
              ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
              : arrivalAction.icon === "print"
                ? <Printer className="mr-1.5 size-3.5" />
                : <UserCheck className="mr-1.5 size-3.5" />}
            {savingId === guest.registrationId ? "Saving…" : arrivalAction.label}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={savingId !== null} onClick={() => onEditBadge(guest, { kind: "check-in", guest })}>
            <PencilLine className="mr-1.5 size-3.5" />Edit badge
          </Button>
        </>
      )}
      {guest.removable ? (
        <Button type="button" size="sm" variant="ghost" disabled={removingId !== null || savingId !== null} onClick={() => onRemove(guest)}>
          <Trash2 className="mr-1.5 size-3.5 text-danger-text" />Remove
        </Button>
      ) : null}
    </div>
  );
}

export default function PublicCheckIn({ token }: { token: string }) {
  const [payload, setPayload] = useState<PublicCheckInStationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [inactive, setInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [savingWalkIn, setSavingWalkIn] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicCheckInGuest | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [badgeEditor, setBadgeEditor] = useState<BadgeEditorState | null>(null);
  const [printLayout, setPrintLayout] = useState<BadgeNameLayout | null>(null);
  const pendingManualPrintCleanupRef = useRef<(() => void) | null>(null);

  const openBadgeEditor = (name: string, completion: BadgeEditorCompletion = { kind: "print-only" }) => {
    setBadgeEditor({ name, completion, ...suggestBadgeNameLayout(name) });
  };

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

  useEffect(() => () => pendingManualPrintCleanupRef.current?.(), []);

  const visibleGuests = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!payload) return [];
    if (!needle) return payload.guests;
    return payload.guests.filter((guest) => [guest.name, lastNameSearchValue(guest.name), guest.organization, guest.segment]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(needle)));
  }, [payload, search]);

  const setCheckedIn = async (guest: PublicCheckInGuest, checkedIn: boolean): Promise<PublicCheckInGuest | null> => {
    if (savingId) return null;
    setSavingId(guest.registrationId);
    setError(null);
    setSavedMessage(null);
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
        return null;
      }
      if (!response.ok || !result || typeof result !== "object" || !("registrationId" in result)) {
        throw new Error(errorMessage(result, "The check-in could not be saved."));
      }
      const updated = result as PublicCheckInGuest;
      setSavedMessage(checkedIn ? `${updated.name} is checked in.` : `${updated.name}'s check-in was undone.`);
      setPayload((current) => current ? {
        ...current,
        guests: current.guests.map((row) => row.registrationId === updated.registrationId ? updated : row),
      } : current);
      return updated;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The check-in could not be saved.");
      return null;
    } finally {
      setSavingId(null);
    }
  };

  const createWalkIn = async (name: string): Promise<PublicCheckInGuest | null> => {
    if (!payload || savingWalkIn) return null;
    setSavingWalkIn(true);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await fetch(`/api/public/assignments/${encodeURIComponent(token)}/check-in/walk-ins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" || !("registrationId" in result)) {
        throw new Error(errorMessage(result, "The walk-in could not be saved."));
      }
      const created = result as PublicCheckInGuest;
      setPayload((current) => current ? {
        ...current,
        guests: [created, ...current.guests.filter((guest) => guest.registrationId !== created.registrationId)],
      } : current);
      setWalkInName("");
      setSavedMessage(`${created.name} was added and checked in.`);
      return created;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The walk-in could not be saved.");
      return null;
    } finally {
      setSavingWalkIn(false);
    }
  };

  const printBadge = async (editor: BadgeEditorState) => {
    if (!badgeNameLayoutMatchesOriginal(editor, editor.name)) return;
    pendingManualPrintCleanupRef.current?.();
    pendingManualPrintCleanupRef.current = null;
    setError(null);
    setSavedMessage(null);
    flushSync(() => {
      setPrintLayout({ line1: editor.line1.trim(), line2: editor.line2.trim() });
      setBadgeEditor(null);
    });
    const completePrint = async () => {
      if (editor.completion.kind === "check-in") {
        await setCheckedIn(editor.completion.guest, true);
      }
      if (editor.completion.kind === "create-walk-in") {
        await createWalkIn(editor.name);
      }
    };
    const printStarted = await printBadgeBeforeCompletion(
      () => {
        let started = false;
        const markStarted = () => { started = true; };
        window.addEventListener("beforeprint", markStarted, { once: true });
        try {
          window.print();
        } catch {
          return false;
        } finally {
          window.removeEventListener("beforeprint", markStarted);
        }
        return started;
      },
      completePrint,
    );
    if (!printStarted) {
      const finishManualPrint = () => {
        pendingManualPrintCleanupRef.current?.();
        pendingManualPrintCleanupRef.current = null;
        setError(null);
        void completePrint();
      };
      const waitForManualPrintToFinish = () => {
        window.addEventListener("afterprint", finishManualPrint, { once: true });
      };
      const cleanupManualPrintListeners = () => {
        window.removeEventListener("beforeprint", waitForManualPrintToFinish);
        window.removeEventListener("afterprint", finishManualPrint);
      };
      pendingManualPrintCleanupRef.current = cleanupManualPrintListeners;
      window.addEventListener("beforeprint", waitForManualPrintToFinish, { once: true });
      setError("Chrome did not open system print. Press Ctrl+P now. The prepared badge will print, and check-in will finish when the print window closes.");
    }
  };

  const prepareWalkInBadge = (editLayout = false) => {
    if (!payload || savingWalkIn) return;
    const name = walkInName.trim().replace(/\s+/g, " ");
    if (!name) {
      setError("Enter the walk-in guest's full name.");
      return;
    }
    setError(null);
    setSavedMessage(null);
    const editor = { name, completion: { kind: "create-walk-in" } as const, ...suggestBadgeNameLayout(name) };
    if (editLayout) openBadgeEditor(name, editor.completion);
    else void printBadge(editor);
  };

  const removeWalkIn = async (guest: PublicCheckInGuest) => {
    if (removingId || !guest.removable) return;
    setRemovingId(guest.registrationId);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await fetch(`/api/public/assignments/${encodeURIComponent(token)}/check-in/walk-ins/${encodeURIComponent(guest.registrationId)}`, {
        method: "DELETE",
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(result, "The walk-in could not be removed."));
      setPayload((current) => current ? {
        ...current,
        guests: current.guests.filter((row) => row.registrationId !== guest.registrationId),
      } : current);
      setDeleteTarget(null);
      setSavedMessage(`${guest.name} was removed from the guest list.`);
    } catch (caught) {
      setDeleteTarget(null);
      setError(caught instanceof Error ? caught.message : "The walk-in could not be removed.");
    } finally {
      setRemovingId(null);
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
  const badgeEditorBusy = savingWalkIn || savingId !== null;

  return (
    <PublicFrame>
      <div className="space-y-5">
        <Panel className="overflow-hidden">
          <div className="border-b border-hairline bg-primary-muted/40 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Pill tone="brand">Shared event-day desk</Pill>
                <h1 className="mt-3 text-2xl font-bold text-foreground">Guest check-in and badge printing</h1>
                <p className="mt-1 text-sm text-muted-foreground">Search the full guest list, then print the badge and check the person in.</p>
              </div>
              <div className="rounded-xl border border-hairline bg-card px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Users className="size-4 text-primary" />No login required</p>
                <p className="mt-1 text-xs text-muted-foreground">Anyone with this secure link can help.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-5 text-sm sm:grid-cols-3 sm:p-6">
            <div><p className="text-xs text-muted-foreground">Event</p><p className="font-semibold text-foreground">{payload.eventTitle}</p></div>
            <div><p className="text-xs text-muted-foreground">Date</p><p className="font-semibold text-foreground">{eventDate}</p></div>
            <div><p className="text-xs text-muted-foreground">Complete guest list A-Z</p><p className="font-semibold text-foreground">{checkedIn} of {payload.guests.length} checked in</p></div>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="border-b border-hairline p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary-muted p-2 text-primary"><UserPlus className="size-4" /></div>
              <div>
                <h2 className="font-semibold text-foreground">Not on the guest list?</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Enter the person's full name and print immediately. Use Edit badge only when you need a custom line break.</p>
              </div>
            </div>
          </div>
          <form
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              prepareWalkInBadge(false);
            }}
          >
            <label className="min-w-0 flex-1 text-sm font-medium text-foreground">
              Full name
              <Input
                value={walkInName}
                onChange={(event) => setWalkInName(event.target.value)}
                placeholder="Type first and last name"
                autoComplete="name"
                maxLength={120}
                className="mt-1"
              />
            </label>
            <Button type="button" variant="outline" disabled={savingWalkIn || savingId !== null || !walkInName.trim()} onClick={() => prepareWalkInBadge(true)}>
              <PencilLine className="mr-1.5 size-4" />Edit badge
            </Button>
            <Button type="submit" disabled={savingWalkIn || savingId !== null || !walkInName.trim()}>
              {savingWalkIn ? <RefreshCw className="mr-1.5 size-4 animate-spin" /> : <Printer className="mr-1.5 size-4" />}
              {savingWalkIn ? "Saving…" : "Print walk-in badge & check in"}
            </Button>
          </form>
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
          {savedMessage ? <p role="status" className="border-b border-success/20 bg-success-tint px-5 py-3 text-sm text-success-text">{savedMessage}</p> : null}
          {payload.guests.length === 0 ? (
            <EmptyState icon={UserCheck} title="No guests are registered yet" description="Add a walk-in above or ask an organizer to import the guest list." />
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
                  <PublicCheckInGuestActions
                    guest={guest}
                    savingId={savingId}
                    removingId={removingId}
                    onPrint={(guest, completion) => void printBadge({ name: guest.name, completion, ...suggestBadgeNameLayout(guest.name) })}
                    onEditBadge={(guest, completion) => openBadgeEditor(guest.name, completion)}
                    onSetCheckedIn={setCheckedIn}
                    onRemove={setDeleteTarget}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />Anyone with this secure link can search the complete A-Z guest list, print badges, check people in and add walk-ins. The link cannot open event settings, budgets, vendors or other workspace information.
        </p>
      </div>
      <NameBadgePrintSheet layout={printLayout} />
      <Dialog open={badgeEditor !== null} onOpenChange={(open) => { if (!open && !badgeEditorBusy) setBadgeEditor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose the badge line break</DialogTitle>
            <DialogDescription>
              Correct capitalization or move whole words between the lines. Nothing is saved until you choose Print badge.
            </DialogDescription>
          </DialogHeader>
          {badgeEditor ? (
            <BadgeNameLayoutFields
              originalName={badgeEditor.name}
              layout={badgeEditor}
              onChange={(layout) => setBadgeEditor({ ...badgeEditor, ...layout })}
            />
          ) : null}
          {error ? <p role="alert" className="rounded-md border border-danger/20 bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={badgeEditorBusy} onClick={() => setBadgeEditor(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={badgeEditorBusy || !badgeEditor || !badgeNameLayoutMatchesOriginal(badgeEditor, badgeEditor.name)}
              onClick={() => { if (badgeEditor) void printBadge(badgeEditor); }}
            >
              {badgeEditorBusy ? <RefreshCw className="mr-1.5 size-4 animate-spin" /> : <Printer className="mr-1.5 size-4" />}
              {badgeEditorBusy ? "Saving…" : "Print badge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !removingId) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the walk-in and their check-in record from this event. Registered guests cannot be removed from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingId !== null}>Keep walk-in</AlertDialogCancel>
            <AlertDialogAction
              disabled={removingId !== null}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void removeWalkIn(deleteTarget);
              }}
            >
              {removingId ? "Removing…" : "Remove walk-in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PublicFrame>
  );
}
