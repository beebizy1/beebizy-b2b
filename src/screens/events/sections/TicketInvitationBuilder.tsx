import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Eye, ImagePlus, Mail, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelHeader, Pill } from "@/components/primitives";
import { useSendTicketInvitations, useTicketInvitations, useUpdateEvent, useUploadAuctionImage } from "@/data/hooks";
import { readSpreadsheetFile } from "@/data/import";
import { REGISTRATION_PAGE_TEMPLATES, normalizeRegistrationPage, registrationPageTemplate } from "@/data/registrationPage";
import { parseTicketInvitationRecipients } from "@/data/ticketInvitations";
import type { Event } from "@/data/entities";
import { toast } from "@/hooks/use-toast";

const STEPS = [
  ["1", "Design invite"],
  ["2", "Add guests"],
  ["3", "Preview and test"],
  ["4", "Send and track"],
] as const;

export default function TicketInvitationBuilder({ event }: { event: Event }) {
  const { data: invitations } = useTicketInvitations(event.id);
  const sendInvitations = useSendTicketInvitations();
  const updateEvent = useUpdateEvent();
  const uploadImage = useUploadAuctionImage();
  const [design, setDesign] = useState(() => normalizeRegistrationPage(event.registrationPage));
  const [guestRows, setGuestRows] = useState("");
  const [consent, setConsent] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => setDesign(normalizeRegistrationPage(event.registrationPage)), [event.id, event.registrationPage]);

  const recipients = useMemo(() => parseTicketInvitationRecipients(guestRows), [guestRows]);
  const template = registrationPageTemplate(design.template);
  const headline = design.headline.trim() || event.title;
  const message = design.welcomeMessage.trim() || event.description || "We would love to see you there.";
  const saveDesign = async () => {
    const registrationPage = normalizeRegistrationPage({ ...design, paymentUrl: null });
    setDesign(registrationPage);
    await updateEvent.mutateAsync({ id: event.id, patch: { registrationPage } });
    return registrationPage;
  };

  const send = async (rows: Array<{ name: string; email: string }>, test = false) => {
    if (rows.length === 0) {
      toast({ title: test ? "Enter your test email" : "Add at least one guest", description: "Use an email by itself or Full name, email." });
      return;
    }
    try {
      await saveDesign();
      const result = await sendInvitations.mutateAsync({ eventId: event.id, recipients: rows, consentConfirmed: true });
      if (!test) setGuestRows("");
      toast({
        title: test ? (result.sent ? "Test invitation sent" : "Test invitation was not delivered") : `${result.sent} invitation${result.sent === 1 ? "" : "s"} sent`,
        description: result.failed ? `${result.failed} could not be delivered. Check the delivery list below.` : test ? `Check ${rows[0]!.email}.` : "Delivery tracking is shown below.",
      });
    } catch (error) {
      toast({ title: test ? "Couldn't send the test" : "Couldn't send invitations", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  return (
    <Panel>
      <PanelHeader title="Invitation builder" description="Design the invite, test it, add guests, and send each person a connected Beebizy ticket link." />

      <div className="grid border-b border-hairline sm:grid-cols-4">
        {STEPS.map(([number, label]) => (
          <div key={number} className="flex items-center gap-2 border-b border-hairline px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <span data-numeric className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{number}</span>
            <span className="text-xs font-semibold text-foreground">{label}</span>
          </div>
        ))}
      </div>

      <section className="grid gap-5 border-b border-hairline p-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <div><p className="text-sm font-semibold text-foreground">1. Design the invitation</p><p className="text-xs text-muted-foreground">This same design appears in the email and on the registration page.</p></div>
          <fieldset className="space-y-2"><legend className="text-sm font-medium text-foreground">Invitation style</legend><div className="grid gap-2 sm:grid-cols-3">{REGISTRATION_PAGE_TEMPLATES.map((option) => <button key={option.id} type="button" aria-pressed={design.template === option.id} onClick={() => setDesign((current) => ({ ...current, template: option.id, accentColor: option.accentColor }))} className="rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm" style={{ borderColor: design.template === option.id ? design.accentColor : undefined, backgroundColor: option.background }}><span className="mb-2 block h-1.5 rounded-full" style={{ backgroundColor: option.accentColor }} /><span className="block text-xs font-semibold text-slate-900">{option.name}</span></button>)}</div></fieldset>
          <div className="space-y-1.5"><Label htmlFor="ticket-invite-headline">Invitation title</Label><Input id="ticket-invite-headline" value={design.headline} placeholder={event.title} maxLength={120} onChange={(inputEvent) => setDesign((current) => ({ ...current, headline: inputEvent.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor="ticket-invite-message">Invitation message</Label><Textarea id="ticket-invite-message" value={design.welcomeMessage} placeholder={event.description || "Tell guests why you would love them to attend."} rows={4} maxLength={600} onChange={(inputEvent) => setDesign((current) => ({ ...current, welcomeMessage: inputEvent.target.value }))} /></div>
          <div className="space-y-2">
            <Label>Invitation image or logo</Label>
            <div className="flex flex-wrap items-center gap-3">
              {design.heroImageUrl ? <img src={design.heroImageUrl} alt="Invitation" className="h-20 w-32 rounded-lg border border-hairline object-cover" /> : <div className="grid h-20 w-32 place-items-center rounded-lg border border-dashed border-hairline bg-surface-sunken"><ImagePlus className="size-5 text-muted-foreground" /></div>}
              <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-surface-sunken">
                <Upload className="mr-1.5 size-4" />{uploadImage.isPending ? "Uploading..." : design.heroImageUrl ? "Replace image" : "Upload image"}
                <input type="file" accept="image/*" className="sr-only" disabled={uploadImage.isPending} onChange={(inputEvent) => { const file = inputEvent.target.files?.[0]; if (!file) return; uploadImage.mutate(file, { onSuccess: (url) => setDesign((current) => ({ ...current, heroImageUrl: url })), onError: (error) => toast({ title: "Couldn't upload image", description: error.message }) }); }} />
              </label>
              {design.heroImageUrl ? <Button type="button" size="sm" variant="ghost" onClick={() => setDesign((current) => ({ ...current, heroImageUrl: null }))}>Remove</Button> : null}
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ticket-invite-color">Brand color</Label><div className="flex items-center gap-2"><input id="ticket-invite-color" type="color" value={design.accentColor} onChange={(inputEvent) => setDesign((current) => ({ ...current, accentColor: inputEvent.target.value.toUpperCase() }))} className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1" /><Input aria-label="Invitation brand color" value={design.accentColor} maxLength={7} onChange={(inputEvent) => setDesign((current) => ({ ...current, accentColor: inputEvent.target.value }))} /></div></div>
          <Button type="button" variant="outline" disabled={updateEvent.isPending || uploadImage.isPending} onClick={() => void saveDesign().then(() => toast({ title: "Invitation design saved" })).catch((error: unknown) => toast({ title: "Couldn't save design", description: error instanceof Error ? error.message : "Try again." }))}><Check className="mr-1.5 size-4" />Save design</Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live invitation preview</p>
          <div className="overflow-hidden rounded-xl border border-hairline shadow-sm" style={{ backgroundColor: template.surface }}>
            {design.heroImageUrl ? <img src={design.heroImageUrl} alt="" className="h-32 w-full object-cover" /> : <div className="grid h-20 place-items-center" style={{ backgroundColor: `${design.accentColor}18` }}><Mail className="size-6" style={{ color: design.accentColor }} /></div>}
            <div className="space-y-3 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: design.accentColor }}>You're invited</p>
              <h3 className="text-xl font-bold text-foreground">{headline}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{message}</p>
              <span className="inline-flex rounded-md px-3 py-2 text-xs font-bold text-primary-foreground" style={{ backgroundColor: design.accentColor }}>Choose a ticket</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 border-b border-hairline p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div><p className="text-sm font-semibold text-foreground">2. Add guests</p><p className="text-xs text-muted-foreground">Enter an email by itself, or use Full name, email. One guest per line.</p></div>
          <Textarea id="ticket-invitees" value={guestRows} onChange={(inputEvent) => setGuestRows(inputEvent.target.value)} placeholder={"laila@beebizy.com\nPoorvi Shukla, poorvi@example.com"} rows={7} className="font-mono text-sm" />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center text-sm font-medium text-primary hover:underline"><Upload className="mr-1.5 size-4" />Upload CSV or Excel<input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(inputEvent) => { const file = inputEvent.target.files?.[0]; if (!file) return; void readSpreadsheetFile(file).then((tables) => { const table = tables[0]; if (!table) throw new Error("The spreadsheet is empty."); const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, ""); const emailHeader = table.headers.find((header) => normalized(header).includes("email")); const fullNameHeader = table.headers.find((header) => ["name", "fullname", "guestname", "attendeename"].includes(normalized(header))); const firstNameHeader = table.headers.find((header) => normalized(header) === "firstname"); const lastNameHeader = table.headers.find((header) => normalized(header) === "lastname"); if (!emailHeader) throw new Error("The file needs an email column."); const lines = table.rows.flatMap((row) => { const email = String(row[emailHeader] ?? "").trim(); const name = fullNameHeader ? String(row[fullNameHeader] ?? "").trim() : [firstNameHeader ? row[firstNameHeader] : null, lastNameHeader ? row[lastNameHeader] : null].filter(Boolean).join(" ").trim(); return email ? [name ? `${name}, ${email}` : email] : []; }); if (!lines.length) throw new Error("No email rows were found."); setGuestRows(lines.join("\n")); toast({ title: `${lines.length} guests loaded` }); }).catch((error: unknown) => toast({ title: "Couldn't read guest list", description: error instanceof Error ? error.message : String(error) })); }} /></label>
            <Pill tone={recipients.length ? "success" : "neutral"}>{recipients.length} valid guest{recipients.length === 1 ? "" : "s"}</Pill>
          </div>
        </div>

        <div className="space-y-4">
          <div><p className="text-sm font-semibold text-foreground">3. Preview and send yourself a test</p><p className="text-xs text-muted-foreground">The test uses the exact design and connected ticket link guests will receive.</p></div>
          <div className="flex gap-2"><Input type="email" value={testEmail} onChange={(inputEvent) => setTestEmail(inputEvent.target.value)} placeholder="Your email address" aria-label="Test invitation email" /><Button type="button" variant="outline" disabled={sendInvitations.isPending || updateEvent.isPending || uploadImage.isPending || !testEmail.trim()} onClick={() => void send(parseTicketInvitationRecipients(testEmail), true)}><Eye className="mr-1.5 size-4" />Send test</Button></div>
          <div className="rounded-lg border border-hairline bg-surface-sunken p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">What the button does</p><p className="mt-1">Creates a private invitation, emails the designed message, and connects the guest directly to this event's Beebizy ticket checkout.</p></div>
        </div>
      </section>

      <section className="space-y-4 p-5">
        <div><p className="text-sm font-semibold text-foreground">4. Send and track</p><p className="text-xs text-muted-foreground">Every person receives a unique link. Delivery, opens, and completed registrations appear below.</p></div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={consent} onChange={(inputEvent) => setConsent(inputEvent.target.checked)} className="mt-1 size-4 accent-[hsl(var(--primary))]" /><span>I confirm these guests expect communication about this event.</span></label>
        <Button type="button" disabled={!recipients.length || !consent || sendInvitations.isPending || updateEvent.isPending || uploadImage.isPending} onClick={() => void send(recipients)}><Send className="mr-1.5 size-4" />{sendInvitations.isPending ? "Sending invitations..." : `Send ${recipients.length || ""} invitation${recipients.length === 1 ? "" : "s"}`}</Button>

        {(invitations ?? []).length > 0 ? <div className="border-t border-hairline pt-4"><p className="mb-2 text-sm font-semibold text-foreground">Delivery tracking</p><ul className="max-h-64 divide-y divide-hairline overflow-auto rounded-lg border border-hairline">{(invitations ?? []).map((invitation) => { const invitationUrl = `${window.location.origin}/api/public/ticket-invitations/${invitation.publicToken}`; return <li key={invitation.id} className="flex items-center gap-2 px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invitation.recipientName}</p><p className="truncate text-xs text-muted-foreground">{invitation.recipientEmail}</p></div><Pill tone={invitation.status === "registered" ? "success" : invitation.status === "failed" ? "warning" : undefined}>{invitation.status}</Pill><Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(invitationUrl); toast({ title: `Link copied for ${invitation.recipientName}` }); }}><Copy className="mr-1.5 size-3.5" />Copy</Button></li>; })}</ul></div> : null}
      </section>
    </Panel>
  );
}
