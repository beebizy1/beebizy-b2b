import { useState } from "react";
import { CalendarDays, Check, CheckCircle2, Download, FileSignature, MapPin, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNotice, Pill } from "@/components/primitives";
import { usePublicVendorPaperwork, useUploadPublicVendorPaperwork } from "@/data/hooks";
import { centsFromInput, formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";

export default function PublicVendorPaperwork({ token }: { token: string }) {
  const { data, isLoading, isError, error, refetch } = usePublicVendorPaperwork(token);
  const upload = useUploadPublicVendorPaperwork();
  const [contract, setContract] = useState<File | null>(null);
  const [coi, setCoi] = useState<File | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [coverage, setCoverage] = useState("");

  if (isLoading) return <PublicShell><div className="mx-auto max-w-2xl animate-pulse rounded-2xl bg-white p-10 text-sm text-muted-foreground">Opening your checklist…</div></PublicShell>;
  if (isError) return <PublicShell><ErrorNotice error={error} onRetry={() => void refetch()} /></PublicShell>;
  if (!data) return <PublicShell><div className="mx-auto max-w-2xl rounded-2xl border border-hairline bg-white p-8"><h1 className="text-2xl font-bold">This link is no longer active</h1><p className="mt-2 text-muted-foreground">Ask the event organizer for a new paperwork link.</p></div></PublicShell>;

  const paperwork = data.paperwork;
  const contractDone = !paperwork.contractRequired || Boolean(paperwork.signedContractUrl);
  const coiDone = !paperwork.coiRequired || Boolean(paperwork.coiFileUrl);
  const complete = contractDone && coiDone;

  const uploadFile = async (kind: "contract" | "coi") => {
    const file = kind === "contract" ? contract : coi;
    if (!file) return;
    if (kind === "coi" && !expiresOn) {
      toast({ title: "Add the policy expiration date" });
      return;
    }
    try {
      await upload.mutateAsync({
        token,
        kind,
        file,
        expiresAt: kind === "coi" ? new Date(`${expiresOn}T12:00:00.000Z`).toISOString() : null,
        coverageCents: kind === "coi" ? centsFromInput(coverage) : null,
      });
      if (kind === "contract") setContract(null);
      else setCoi(null);
      toast({ title: kind === "contract" ? "Signed contract uploaded" : "Insurance certificate uploaded" });
    } catch (uploadError) {
      toast({ title: "Couldn't upload the document", description: uploadError instanceof Error ? uploadError.message : "Try again." });
    }
  };

  return (
    <PublicShell>
      <main className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[#eadfbc] bg-white shadow-sm">
        <header className="bg-[#17130a] px-5 py-6 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ffd700]">Vendor paperwork</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Hi {data.vendorName}, let’s finish this.</h1>
          <p className="mt-2 max-w-xl text-sm text-white/75">Upload the requested files below. No account, password, or extra form is needed.</p>
        </header>

        <div className="border-b border-hairline bg-[#fffaf0] px-5 py-4 sm:px-8">
          <h2 className="font-semibold text-foreground">{data.eventTitle}</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Date(data.eventDate).toLocaleDateString(undefined, { dateStyle: "long" })}</span>
            {data.eventLocation ? <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{data.eventLocation}</span> : null}
          </div>
          {paperwork.instructions ? <p className="mt-3 rounded-lg border border-[#eadfbc] bg-white p-3 text-sm">{paperwork.instructions}</p> : null}
        </div>

        <div className="space-y-4 p-5 sm:p-8">
          {paperwork.contractRequired ? (
            <DocumentStep number={1} icon={FileSignature} title="Sign the contract" done={contractDone} status={paperwork.contractStatus}>
              {paperwork.contractFileUrl ? <Button asChild variant="outline" className="w-full sm:w-auto"><a href={paperwork.contractFileUrl} target="_blank" rel="noreferrer"><Download className="mr-2 size-4" />Download {paperwork.contractFileName ?? "contract"}</a></Button> : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><Input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(event) => setContract(event.target.files?.[0] ?? null)} /><Button disabled={!contract || upload.isPending} onClick={() => void uploadFile("contract")}><Upload className="mr-2 size-4" />{upload.isPending ? "Uploading…" : "Upload signed contract"}</Button></div>
              {paperwork.signedContractName ? <p className="mt-2 text-xs text-success-text">Uploaded: {paperwork.signedContractName}</p> : null}
            </DocumentStep>
          ) : null}

          {paperwork.coiRequired ? (
            <DocumentStep number={paperwork.contractRequired ? 2 : 1} icon={ShieldCheck} title="Upload insurance" done={coiDone} status={paperwork.coiStatus}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="coi-expiration">Policy expiration date</Label><Input id="coi-expiration" className="mt-1" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></div>
                <div><Label htmlFor="coi-coverage">Coverage amount</Label><div className="mt-1 flex items-center gap-2"><span>$</span><Input id="coi-coverage" inputMode="decimal" placeholder="1,000,000" value={coverage} onChange={(event) => setCoverage(event.target.value)} /></div></div>
              </div>
              {paperwork.minimumCoverageCents !== null ? <p className="mt-2 text-xs text-muted-foreground">Minimum requested: {formatMoney(paperwork.minimumCoverageCents)}</p> : null}
              {paperwork.additionalInsured ? <p className="mt-1 text-xs text-muted-foreground">Additional insured: {paperwork.additionalInsured}</p> : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><Input type="file" accept=".pdf,image/*" onChange={(event) => setCoi(event.target.files?.[0] ?? null)} /><Button disabled={!coi || !expiresOn || upload.isPending} onClick={() => void uploadFile("coi")}><Upload className="mr-2 size-4" />{upload.isPending ? "Uploading…" : "Upload COI"}</Button></div>
              {paperwork.coiFileName ? <p className="mt-2 text-xs text-success-text">Uploaded: {paperwork.coiFileName}</p> : null}
              {paperwork.coiStatus === "needs-changes" ? <p className="mt-2 rounded-lg bg-danger-tint p-2 text-xs text-danger-text">The expiration date or coverage amount does not meet the event requirement. Upload a replacement when ready.</p> : null}
            </DocumentStep>
          ) : null}

          {complete ? <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-tint p-4 text-success-text"><CheckCircle2 className="mt-0.5 size-6" /><div><p className="font-semibold">You’re done</p><p className="text-sm">{data.organizerName} can review your files now. You may close this page.</p></div></div> : null}
        </div>
      </main>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#fffaf0]"><div className="border-b border-[#eadfbc] bg-white px-5 py-4"><div className="mx-auto flex max-w-2xl items-center gap-2 font-bold"><span className="flex size-8 items-center justify-center rounded-full bg-[#ffd700] text-[#17130a]">b</span>beebizy</div></div><div className="px-4 py-6 sm:py-10">{children}</div></div>;
}

function DocumentStep({ number, icon: Icon, title, done, status, children }: { number: number; icon: typeof ShieldCheck; title: string; done: boolean; status: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-hairline p-4 sm:p-5"><div className="mb-4 flex items-center gap-3"><span className={done ? "flex size-8 items-center justify-center rounded-full bg-success text-white" : "flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"}>{done ? <Check className="size-4" /> : number}</span><Icon className="size-5 text-muted-foreground" /><h2 className="font-semibold">{title}</h2><Pill className="ml-auto" tone={done ? "success" : "warning"}>{status.replace("-", " ")}</Pill></div>{children}</section>;
}
