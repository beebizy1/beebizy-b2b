import { Check, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useUploadAuctionImage } from "@/data/hooks";
import { LinkedText } from "@/components/LinkedText";
import { apparelQuestion, APPAREL_PRESETS } from "@/data/eventOperations";
import { RSVP_CONFIRMATION_LIMITS, rsvpConfirmationCopy, type RegistrationPageSettings, type RegistrationQuestion } from "@/data/registrationPage";

export function RegistrationExtrasEditor({ draft, eventTitle, guestType, onChange }: { draft: RegistrationPageSettings; eventTitle: string; guestType: string; onChange: (patch: Partial<RegistrationPageSettings>) => void }) {
  const upload = useUploadAuctionImage();
  const confirmation = rsvpConfirmationCopy(draft, eventTitle, guestType);
  const defaultConfirmation = rsvpConfirmationCopy({ ...draft, rsvpConfirmationTitle: "", rsvpConfirmationMessage: "" }, eventTitle, guestType);
  const updateQuestion = (index: number, patch: Partial<RegistrationQuestion>) => onChange({ questions: draft.questions.map((question, i) => i === index ? { ...question, ...patch } : question) });
  const addQuestion = (kind?: keyof typeof APPAREL_PRESETS) => onChange({ questions: [...draft.questions, kind ? apparelQuestion(kind, crypto.randomUUID()) : { id: crypto.randomUUID(), label: "", type: "text", required: false, audience: "primary", options: [] }] });
  return <div className="space-y-6">
    <fieldset className="space-y-4 rounded-xl border border-hairline p-4">
      <legend className="px-1 text-sm font-semibold">After guests RSVP</legend>
      <p className="text-sm text-muted-foreground">Choose what guests see on screen after they register. Leave either field blank to use the default. This only changes the on-screen message.</p>
      <div className="space-y-1.5">
        <Label htmlFor="rsvp-confirmation-title">Confirmation title</Label>
        <Input id="rsvp-confirmation-title" value={draft.rsvpConfirmationTitle} placeholder={defaultConfirmation.title} maxLength={RSVP_CONFIRMATION_LIMITS.title} onChange={e => onChange({ rsvpConfirmationTitle: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rsvp-confirmation-message">Confirmation message</Label>
        <Textarea id="rsvp-confirmation-message" value={draft.rsvpConfirmationMessage} placeholder={defaultConfirmation.message} maxLength={RSVP_CONFIRMATION_LIMITS.message} rows={4} onChange={e => onChange({ rsvpConfirmationMessage: e.target.value })} />
      </div>
      <div className="rounded-lg border border-hairline bg-surface px-4 py-4">
        <p className="text-xs font-semibold text-muted-foreground">Guest preview</p>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success-tint text-success-text"><Check aria-hidden="true" className="size-4" /></span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold">{confirmation.title}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground"><LinkedText text={confirmation.message} /></p>
          </div>
        </div>
      </div>
    </fieldset>
    <fieldset className="space-y-4 rounded-xl border border-hairline p-4">
      <legend className="px-1 text-sm font-semibold">Bottom RSVP banner</legend>
      <p className="text-xs leading-5 text-muted-foreground">This is the image behind the RSVP button at the bottom of your public page. By default it uses the main invitation photo.</p>
      <Label htmlFor="footer-image-source">Bottom banner photo</Label>
      <select id="footer-image-source" value={draft.footerImageSource} onChange={e => onChange({ footerImageSource: e.target.value as RegistrationPageSettings["footerImageSource"] })} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
        <option value="invitation">Use the main invitation photo</option><option value="custom">Use a different photo</option><option value="none">No photo</option>
      </select>
      {draft.footerImageSource === "custom" ? <div className="flex flex-wrap items-center gap-3">
        {draft.footerImageUrl ? <img src={draft.footerImageUrl} alt="Bottom banner preview" className="h-20 w-36 rounded-lg border border-hairline object-cover" /> : null}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm"><ImagePlus className="size-4" />{upload.isPending ? "Uploading…" : draft.footerImageUrl ? "Replace bottom photo" : "Upload bottom photo"}
          <input type="file" accept="image/*" className="sr-only" aria-label="Upload bottom banner photo" disabled={upload.isPending} onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            upload.mutate(file, { onSuccess: url => onChange({ footerImageUrl: url }), onError: error => toast({ title: "Couldn't upload the bottom photo", description: error.message }) });
            e.target.value = "";
          }} />
        </label>
        {draft.footerImageUrl ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ footerImageUrl: null })}>Remove bottom photo</Button> : null}
      </div> : null}
    </fieldset>
    <fieldset className="space-y-4 rounded-xl border border-hairline p-4">
      <legend className="px-1 text-sm font-semibold">RSVP questions</legend>
      <p className="text-xs leading-5 text-muted-foreground">Ask for details such as T-shirt size or dietary needs after guests click RSVP. Answers appear with the guest in the Registrations spreadsheet.</p>
      <p className="text-xs leading-5 text-muted-foreground">Choose who answers each question. Additional guests always have their own name and optional email fields.</p>
      {draft.questions.map((question, index) => <div key={question.id} className="space-y-3 rounded-lg border border-hairline bg-surface p-3">
        <div><Label htmlFor={`question-label-${question.id}`}>Question {index + 1}</Label><Input id={`question-label-${question.id}`} maxLength={160} value={question.label} placeholder="Example: Do you have any dietary needs?" onChange={e => updateQuestion(index, { label: e.target.value })} /></div>
        <div><Label htmlFor={`question-type-${question.id}`}>Answer format</Label><select id={`question-type-${question.id}`} value={question.type} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" onChange={e => updateQuestion(index, { type: e.target.value as RegistrationQuestion["type"] })}><option value="text">Short written answer</option><option value="select">Choose from a list</option></select></div>
        <div><Label htmlFor={`question-audience-${question.id}`}>Who should answer?</Label><select id={`question-audience-${question.id}`} value={question.audience ?? "both"} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" onChange={e => updateQuestion(index, { audience: e.target.value as RegistrationQuestion["audience"] })}><option value="primary">Main attendee only</option><option value="guests">Additional guests only</option><option value="both">Main attendee and additional guests</option></select></div>
        {question.type === "select" ? <div><Label htmlFor={`question-options-${question.id}`}>Choices, one per line</Label><Textarea id={`question-options-${question.id}`} rows={4} value={question.options.join("\n")} onChange={e => updateQuestion(index, { options: e.target.value.split("\n").slice(0, 20) })} /></div> : null}
        <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[hsl(var(--primary))]" checked={question.required} onChange={e => updateQuestion(index, { required: e.target.checked })} />Require an answer</label><Button type="button" size="sm" variant="ghost" onClick={() => onChange({ questions: draft.questions.filter((_, i) => i !== index) })}><Trash2 className="size-3.5" />Remove question</Button></div>
      </div>)}
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={draft.questions.length >= 12} onClick={() => addQuestion()}><Plus className="size-3.5" />Add question</Button>{(Object.keys(APPAREL_PRESETS) as Array<keyof typeof APPAREL_PRESETS>).map(kind => <Button key={kind} type="button" size="sm" variant="outline" disabled={draft.questions.length >= 12} onClick={() => addQuestion(kind)}>Add {APPAREL_PRESETS[kind].label.toLowerCase()}</Button>)}</div>
      <p className="text-xs text-muted-foreground">Sizing presets ask each attendee and additional guest. After saving the invitation, select these questions in Command center to create fulfillment reports and set a production cutoff.</p>
    </fieldset>
  </div>;
}
