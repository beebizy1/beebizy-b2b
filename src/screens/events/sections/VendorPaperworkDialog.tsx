import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ClipboardCheck, Copy, FileCheck2, FileText, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/primitives";
import type { EventVendor, VendorPaperworkDraft, VendorPaperworkReview } from "@/data/entities";
import {
  useReviewVendorPaperwork,
  useSaveVendorPaperworkDraft,
  useSendVendorPaperworkRequest,
  useUploadVendorContract,
} from "@/data/hooks";
import { centsFromInput, centsToInput } from "@/data/money";
import { toast } from "@/hooks/use-toast";

type SaveState = "saved" | "saving" | "device-only" | "failed";

interface StoredDraft {
  revision: number;
  draft: VendorPaperworkDraft;
}

function draftFromBooking(booking: EventVendor): VendorPaperworkDraft {
  return {
    contractRequired: booking.paperwork.contractRequired,
    coiRequired: booking.paperwork.coiRequired,
    minimumCoverageCents: booking.paperwork.minimumCoverageCents,
    additionalInsured: booking.paperwork.additionalInsured,
    instructions: booking.paperwork.instructions,
  };
}

function localKey(eventId: string, bookingId: string): string {
  return `beebizy:vendor-paperwork:${eventId}:${bookingId}`;
}

function readStoredDraft(key: string): StoredDraft | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as StoredDraft | null;
    return parsed && Number.isFinite(parsed.revision) && parsed.draft ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredDraft(key: string, value: StoredDraft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function documentTone(status: EventVendor["paperwork"]["contractStatus"]): "neutral" | "warning" | "success" | "danger" {
  if (status === "approved") return "success";
  if (status === "needs-changes") return "danger";
  if (status === "waiting") return "warning";
  return "neutral";
}

function paperworkLabel(booking: EventVendor): string {
  const paperwork = booking.paperwork;
  if (!paperwork.contractRequired && !paperwork.coiRequired) return "Paperwork";
  if (!paperwork.requestedAt) return "Paperwork draft";
  const required = [paperwork.contractRequired ? paperwork.contractStatus : null, paperwork.coiRequired ? paperwork.coiStatus : null].filter(Boolean);
  if (required.every((status) => status === "approved")) return "Paperwork ready";
  if (required.some((status) => status === "received" || status === "needs-changes")) return "Review paperwork";
  return paperwork.deliveryError ? "Request failed" : "Waiting on vendor";
}

export default function VendorPaperworkDialog({ eventId, booking }: { eventId: string; booking: EventVendor }) {
  const saveDraft = useSaveVendorPaperworkDraft();
  const uploadContract = useUploadVendorContract();
  const sendRequest = useSendVendorPaperworkRequest();
  const review = useReviewVendorPaperwork();
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<StoredDraft>({ revision: booking.paperwork.revision, draft: draftFromBooking(booking) });
  const [coverage, setCoverage] = useState(centsToInput(booking.paperwork.minimumCoverageCents));
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = localKey(eventId, booking.id);

  const requested = Boolean(booking.paperwork.requestedAt);
  const contractReceived = Boolean(booking.paperwork.signedContractUrl);
  const coiReceived = Boolean(booking.paperwork.coiFileUrl);
  const canSend = (stored.draft.contractRequired || stored.draft.coiRequired) &&
    (!stored.draft.contractRequired || Boolean(booking.paperwork.contractFileUrl)) &&
    Boolean(booking.vendor?.contactEmail);
  const requestUrl = booking.paperwork.publicToken
    ? `${window.location.origin}/vendor-paperwork/${booking.paperwork.publicToken}`
    : null;

  const stepState = useMemo(() => {
    const needsReview = (stored.draft.contractRequired && contractReceived && booking.paperwork.contractStatus !== "approved") ||
      (stored.draft.coiRequired && coiReceived && booking.paperwork.coiStatus !== "approved");
    const allApproved = (!stored.draft.contractRequired || booking.paperwork.contractStatus === "approved") &&
      (!stored.draft.coiRequired || booking.paperwork.coiStatus === "approved") &&
      (stored.draft.contractRequired || stored.draft.coiRequired);
    return { needsReview, allApproved };
  }, [booking.paperwork.coiStatus, booking.paperwork.contractStatus, coiReceived, contractReceived, stored.draft]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const setDialogOpen = (next: boolean) => {
    if (next) {
      const server: StoredDraft = { revision: booking.paperwork.revision, draft: draftFromBooking(booking) };
      const local = readStoredDraft(key);
      const initial = local && local.revision > server.revision ? local : server;
      setStored(initial);
      setCoverage(centsToInput(initial.draft.minimumCoverageCents ?? null));
      setSaveState(local && local.revision > server.revision ? "device-only" : "saved");
    }
    setOpen(next);
  };

  const persist = (nextDraft: VendorPaperworkDraft) => {
    const next: StoredDraft = { revision: Math.max(Date.now(), stored.revision + 1), draft: nextDraft };
    setStored(next);
    setSaveState(writeStoredDraft(key, next) ? "device-only" : "failed");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const result = await saveDraft.mutateAsync({ eventId, bookingId: booking.id, draft: next.draft, clientRevision: next.revision });
        if (result.paperwork.revision >= next.revision) {
          localStorage.removeItem(key);
          setSaveState("saved");
        }
      } catch {
        setSaveState("device-only");
      }
    }, 650);
  };

  const updateDraft = (patch: Partial<VendorPaperworkDraft>) => persist({ ...stored.draft, ...patch });

  const flushDraft = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    const result = await saveDraft.mutateAsync({ eventId, bookingId: booking.id, draft: stored.draft, clientRevision: stored.revision });
    if (result.paperwork.revision >= stored.revision) {
      localStorage.removeItem(key);
      setSaveState("saved");
    }
  };

  const send = async () => {
    try {
      await flushDraft();
      const result = await sendRequest.mutateAsync({ eventId, bookingId: booking.id });
      toast({
        title: result.paperwork.deliveryError ? "Request saved, but email was not delivered" : "Vendor request sent",
        description: result.paperwork.deliveryError ?? `${booking.vendor?.name ?? "The vendor"} can upload everything from one private link.`,
      });
    } catch (error) {
      setSaveState("device-only");
      toast({ title: "Couldn't send the request", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const reviewDocument = async (next: VendorPaperworkReview) => {
    try {
      await review.mutateAsync({ eventId, bookingId: booking.id, review: next });
      toast({ title: Object.values(next)[0] === "approved" ? "Document approved" : "Changes requested" });
    } catch (error) {
      toast({ title: "Couldn't update the review", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <FileCheck2 className="size-3.5" />
          {paperworkLabel(booking)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-hairline bg-[#fffaf0] px-5 py-4 sm:px-6">
          <DialogTitle>Paperwork for {booking.vendor?.name ?? "vendor"}</DialogTitle>
          <DialogDescription>Ask once. The vendor uploads without logging in. You approve what arrives.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 border-b border-hairline bg-white text-center text-xs sm:text-sm">
          {[
            { number: 1, label: "Choose what you need", done: requested },
            { number: 2, label: "Vendor uploads", done: contractReceived || coiReceived },
            { number: 3, label: "Review", done: stepState.allApproved },
          ].map((step) => (
            <div key={step.number} className="flex min-h-20 flex-col items-center justify-center gap-1 border-r border-hairline px-2 last:border-r-0">
              <span className={step.done ? "flex size-7 items-center justify-center rounded-full bg-success text-white" : "flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"}>
                {step.done ? <Check className="size-4" /> : step.number}
              </span>
              <span className="font-medium text-foreground">{step.label}</span>
            </div>
          ))}
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <section className="rounded-xl border border-hairline">
            <div className="border-b border-hairline px-4 py-3">
              <h3 className="font-semibold">1. What should the vendor send?</h3>
              <p className="text-xs text-muted-foreground">Your changes save automatically.</p>
            </div>
            <div className="space-y-4 p-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-hairline p-3">
                <input type="checkbox" className="mt-1 size-4 accent-[hsl(var(--primary))]" checked={stored.draft.contractRequired} onChange={(event) => updateDraft({ contractRequired: event.target.checked })} />
                <FileText className="mt-0.5 size-5 text-muted-foreground" />
                <span className="min-w-0 flex-1"><span className="block font-medium">Signed contract</span><span className="block text-xs text-muted-foreground">Upload the contract they need to sign.</span></span>
              </label>
              {stored.draft.contractRequired ? (
                <div className="ml-0 rounded-lg bg-surface-sunken p-3 sm:ml-10">
                  <Label htmlFor={`contract-${booking.id}`}>Contract file</Label>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input id={`contract-${booking.id}`} type="file" accept=".pdf,.doc,.docx,image/*" className="max-w-sm" disabled={uploadContract.isPending} onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        await uploadContract.mutateAsync({ eventId, bookingId: booking.id, file });
                        toast({ title: "Contract uploaded" });
                      } catch (error) {
                        toast({ title: "Couldn't upload the contract", description: error instanceof Error ? error.message : "Try again." });
                      }
                    }} />
                    {booking.paperwork.contractFileName ? <Pill tone="success">{booking.paperwork.contractFileName}</Pill> : <Pill tone="warning">Required before sending</Pill>}
                  </div>
                </div>
              ) : null}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-hairline p-3">
                <input type="checkbox" className="mt-1 size-4 accent-[hsl(var(--primary))]" checked={stored.draft.coiRequired} onChange={(event) => updateDraft({ coiRequired: event.target.checked })} />
                <ShieldCheck className="mt-0.5 size-5 text-muted-foreground" />
                <span className="min-w-0 flex-1"><span className="block font-medium">Certificate of insurance</span><span className="block text-xs text-muted-foreground">The vendor uploads their COI and enters coverage details.</span></span>
              </label>
              {stored.draft.coiRequired ? (
                <div className="grid gap-3 rounded-lg bg-surface-sunken p-3 sm:grid-cols-2 sm:pl-10">
                  <div><Label htmlFor={`coverage-${booking.id}`}>Minimum coverage</Label><div className="mt-1 flex items-center gap-2"><span className="text-sm">$</span><Input id={`coverage-${booking.id}`} inputMode="decimal" value={coverage} placeholder="1,000,000" onChange={(event) => setCoverage(event.target.value)} onBlur={() => updateDraft({ minimumCoverageCents: centsFromInput(coverage) })} /></div></div>
                  <div><Label htmlFor={`insured-${booking.id}`}>Additional insured wording</Label><Input id={`insured-${booking.id}`} className="mt-1" value={stored.draft.additionalInsured ?? ""} placeholder="Your organization name" onChange={(event) => updateDraft({ additionalInsured: event.target.value })} /></div>
                </div>
              ) : null}
              <div><Label htmlFor={`instructions-${booking.id}`}>Anything else? <span className="font-normal text-muted-foreground">Optional</span></Label><Textarea id={`instructions-${booking.id}`} className="mt-1" rows={3} value={stored.draft.instructions ?? ""} placeholder="Add one short note for the vendor." onChange={(event) => updateDraft({ instructions: event.target.value })} /></div>
              <p className={saveState === "failed" ? "text-xs text-danger-text" : "text-xs text-muted-foreground"} aria-live="polite">
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "device-only" ? "Saved on this device. Reconnecting…" : "Could not save on this device."}
              </p>
            </div>
          </section>

          {requested ? (
            <section className="rounded-xl border border-hairline">
              <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3"><h3 className="font-semibold">2. Vendor uploads</h3><Pill tone={booking.paperwork.deliveryError ? "danger" : "success"}>{booking.paperwork.deliveryError ? "Email failed" : "Request sent"}</Pill></div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {stored.draft.contractRequired ? <DocumentCard title="Signed contract" status={booking.paperwork.contractStatus} fileName={booking.paperwork.signedContractName} fileUrl={booking.paperwork.signedContractUrl} /> : null}
                {stored.draft.coiRequired ? <DocumentCard title="Certificate of insurance" status={booking.paperwork.coiStatus} fileName={booking.paperwork.coiFileName} fileUrl={booking.paperwork.coiFileUrl} /> : null}
              </div>
              {requestUrl ? <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3"><span className="text-xs text-muted-foreground">Private vendor link</span><Button type="button" variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(requestUrl); toast({ title: "Link copied" }); }}><Copy className="mr-1.5 size-3.5" />Copy link</Button></div> : null}
            </section>
          ) : null}

          {stepState.needsReview ? (
            <section className="rounded-xl border border-primary/40 bg-[#fffdf4] p-4">
              <div className="flex gap-3"><ClipboardCheck className="mt-0.5 size-5" /><div><h3 className="font-semibold">3. Review what arrived</h3><p className="text-xs text-muted-foreground">Open each file, then approve it or ask the vendor to replace it.</p></div></div>
              <div className="mt-4 space-y-3">
                {stored.draft.contractRequired && contractReceived ? <ReviewRow label="Signed contract" url={booking.paperwork.signedContractUrl!} status={booking.paperwork.contractStatus} onReview={(status) => void reviewDocument({ contractStatus: status })} pending={review.isPending} /> : null}
                {stored.draft.coiRequired && coiReceived ? <ReviewRow label="Certificate of insurance" url={booking.paperwork.coiFileUrl!} status={booking.paperwork.coiStatus} onReview={(status) => void reviewDocument({ coiStatus: status })} pending={review.isPending} /> : null}
              </div>
            </section>
          ) : null}

          {stepState.allApproved ? <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-tint p-4 text-success-text"><CheckCircle2 className="size-6" /><div><p className="font-semibold">Paperwork complete</p><p className="text-xs">This vendor is cleared for the event.</p></div></div> : null}
        </div>

        <DialogFooter className="border-t border-hairline px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button type="button" disabled={!canSend || sendRequest.isPending || saveDraft.isPending} onClick={() => void send()}>
            <Send className="mr-1.5 size-4" />{sendRequest.isPending ? "Sending…" : requested ? "Send again" : "Send vendor request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentCard({ title, status, fileName, fileUrl }: { title: string; status: EventVendor["paperwork"]["contractStatus"]; fileName: string | null; fileUrl: string | null }) {
  return <div className="rounded-lg border border-hairline p-3"><div className="flex items-center gap-2"><FileText className="size-4" /><span className="text-sm font-medium">{title}</span><Pill className="ml-auto" tone={documentTone(status)}>{status.replace("-", " ")}</Pill></div>{fileUrl ? <a className="mt-2 block truncate text-xs font-medium text-info-text underline" href={fileUrl} target="_blank" rel="noreferrer">{fileName ?? "Open document"}</a> : <p className="mt-2 text-xs text-muted-foreground">Nothing uploaded yet.</p>}</div>;
}

function ReviewRow({ label, url, status, onReview, pending }: { label: string; url: string; status: EventVendor["paperwork"]["contractStatus"]; onReview: (status: "approved" | "needs-changes") => void; pending: boolean }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-white p-3"><a href={url} target="_blank" rel="noreferrer" className="mr-auto text-sm font-medium underline">Open {label.toLowerCase()}</a><Pill tone={documentTone(status)}>{status.replace("-", " ")}</Pill><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onReview("needs-changes")}>Ask to replace</Button><Button type="button" size="sm" disabled={pending} onClick={() => onReview("approved")}><Check className="mr-1 size-3.5" />Approve</Button></div>;
}
