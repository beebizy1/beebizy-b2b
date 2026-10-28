import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Eye, ImagePlus, Mail, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelHeader, Pill } from "@/components/primitives";
import { useRegistrations, useSendTicketInvitations, useSettings, useTicketInvitations, useTickets, useUpdateRegistrationPage, useUploadAuctionImage } from "@/data/hooks";
import { readSpreadsheetFile } from "@/data/import";
import { REGISTRATION_PAGE_TEMPLATES, normalizeRegistrationPage, registrationPageTemplate } from "@/data/registrationPage";
import { eventInvitationRecipients, parseTicketInvitationRecipients, ticketInvitationRsvpPath } from "@/data/ticketInvitations";
import type { TicketInvitationRecipientDraft } from "@/data/ticketInvitations";
import type { Event } from "@/data/entities";
import { toast } from "@/hooks/use-toast";
import { formatInZone, localTimeZone } from "@/lib/datetime";

const STEPS = [
  ["1", "Design invite"],
  ["2", "Add guests"],
  ["3", "Preview and test"],
  ["4", "Send and track"],
] as const;

function RecipientEditor({ id, value, onChange, eventInvitees, onUseEventList, onUpload, validCount }: { id: string; value: string; onChange(value: string): void; eventInvitees: TicketInvitationRecipientDraft[]; onUseEventList(): void; onUpload(file: File): void; validCount: number }) {
  return <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor={id}>People receiving this invitation</Label>{eventInvitees.length > 0 ? <Button type="button" size="sm" variant="outline" onClick={onUseEventList}>Reload {eventInvitees.length} from invite list</Button> : null}</div><Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={7} className="font-mono text-sm" placeholder={"Full name, email\nFull name, email"} /><div className="flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center text-sm font-medium text-primary hover:underline"><Upload className="mr-1.5 size-4" />Upload CSV or Excel<input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} /></label><Pill tone={validCount ? "success" : "neutral"}>{validCount} valid guest{validCount === 1 ? "" : "s"}</Pill></div></div>;
}

function SendControls({ recipientCount, consent, onConsentChange, busy, onSend, tracking }: { recipientCount: number; consent: boolean; onConsentChange(value: boolean): void; busy: boolean; onSend(): void; tracking: ReactNode }) {
  return <div className="space-y-4"><label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} className="mt-1 size-4 accent-[hsl(var(--primary))]" /><span>I confirm these guests expect communication about this event.</span></label><Button type="button" disabled={!recipientCount || !consent || busy} onClick={onSend}><Send className="mr-1.5 size-4" />{busy ? "Sending invitations…" : `Send ${recipientCount || ""} invitation${recipientCount === 1 ? "" : "s"}`}</Button>{tracking}</div>;
}

function InvitationPreview({ design, event, headline, message, timeZone }: { design: ReturnType<typeof normalizeRegistrationPage>; event: Event; headline: string; message: string; timeZone: string }) {
  const template = registrationPageTemplate(design.template);
  return <div className="overflow-hidden rounded-xl border border-hairline shadow-sm" style={{ backgroundColor: template.surface }}>
    {design.heroImageUrl ? <div className={`grid h-32 w-full place-items-center ${design.heroImageDisplay === "logo" ? "bg-surface-sunken p-5" : ""}`}>{design.heroImageDisplay === "logo" ? <img src={design.heroImageUrl} alt="Event logo" className="max-h-20 max-w-[75%] object-contain" /> : <img src={design.heroImageUrl} alt="" className="h-32 w-full object-cover" />}</div> : <div className="grid h-20 place-items-center" style={{ backgroundColor: `${design.accentColor}18` }}><Mail className="size-6" style={{ color: design.accentColor }} /></div>}
    <div className="space-y-3 p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: design.accentColor }}>You&apos;re invited</p>
      <h3 className="text-xl font-bold text-foreground">{headline}</h3>
      <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{message}</p>
      <dl className="space-y-1 rounded-lg bg-surface-sunken p-3 text-xs text-muted-foreground"><div><dt className="inline font-semibold text-foreground">When: </dt><dd className="inline">{formatInZone(event.date, timeZone, "dayMonthYearTime")}</dd></div>{event.location ? <div><dt className="inline font-semibold text-foreground">Where: </dt><dd className="inline">{event.location}</dd></div> : null}</dl>
      {design.agendaIntroduction ? <div className="border-t border-hairline pt-3"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Agenda</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{design.agendaIntroduction}</p></div> : null}
      <span className="inline-flex rounded-md px-3 py-2 text-xs font-bold text-primary-foreground" style={{ backgroundColor: design.accentColor }}>View invitation &amp; RSVP</span>
    </div>
  </div>;
}

export default function TicketInvitationBuilder({ event, guided = false, onDone, onEditDesign }: { event: Event; guided?: boolean; onDone?: () => void; onEditDesign?: () => void }) {
  const { data: invitations } = useTicketInvitations(event.id);
  const { data: registrations } = useRegistrations();
  const sendInvitations = useSendTicketInvitations();
  const { data: tickets } = useTickets(event.id);
  const { data: workspaceSettings } = useSettings();
  const updateEvent = useUpdateRegistrationPage();
  const uploadImage = useUploadAuctionImage();
  const [design, setDesign] = useState(() => normalizeRegistrationPage(event.registrationPage));
  const [guestRows, setGuestRows] = useState("");
  const [consent, setConsent] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [prefilledEventList, setPrefilledEventList] = useState(false);

  useEffect(() => setDesign(normalizeRegistrationPage(event.registrationPage)), [event.id, event.registrationPage]);

  const recipients = useMemo(() => parseTicketInvitationRecipients(guestRows), [guestRows]);
  const eventInvitees = useMemo(() => eventInvitationRecipients(registrations ?? [], event.id), [event.id, registrations]);
  const headline = design.headline.trim() || event.title;
  const message = design.welcomeMessage.trim() || event.description || "We would love to see you there.";
  const hasTickets = (tickets ?? []).some((ticket) => ticket.isActive);
  const timeZone = event.timeZone ?? workspaceSettings?.timeZone ?? localTimeZone();
  const rsvpPreviewPath = event.shareToken ? ticketInvitationRsvpPath(event.shareToken, { hasTickets, preview: true }) : null;
  const saveDesign = async () => {
    const registrationPage = normalizeRegistrationPage({ ...design, paymentUrl: null });
    setDesign(registrationPage);
    await updateEvent.mutateAsync({ id: event.id, patch: {
      template: registrationPage.template,
      accentColor: registrationPage.accentColor,
      headline: registrationPage.headline,
      welcomeMessage: registrationPage.welcomeMessage,
      agendaIntroduction: registrationPage.agendaIntroduction,
      heroImageUrl: registrationPage.heroImageUrl,
      heroImageDisplay: registrationPage.heroImageDisplay,
    } });
    return registrationPage;
  };

  const send = async (rows: Array<{ name: string; email: string }>, test = false) => {
    if (rows.length === 0) {
      toast({ title: test ? "Enter your test email" : "Add at least one guest", description: "Use an email by itself or Full name, email." });
      return;
    }
    try {
      await saveDesign();
      const result = await sendInvitations.mutateAsync({ eventId: event.id, recipients: rows, consentConfirmed: true, testOnly: test });
      if (!test) setGuestRows("");
      toast({
        title: test ? (result.sent ? "Test invitation sent" : "Test invitation was not delivered") : `${result.sent} invitation${result.sent === 1 ? "" : "s"} sent`,
        description: result.failed ? `${result.failed} could not be delivered. Check the delivery list below.` : test ? `Check ${rows[0]!.email}.` : "Delivery tracking is shown below.",
      });
      if (!test) onDone?.();
    } catch (error) {
      toast({ title: test ? "Couldn't send the test" : "Couldn't send invitations", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const useEventGuestList = () => {
    setGuestRows(eventInvitees.map((guest) => `${guest.name}, ${guest.email}`).join("\n"));
    setPrefilledEventList(true);
    toast({ title: `${eventInvitees.length} guests loaded from Step 2` });
  };

  useEffect(() => {
    if (!guided || prefilledEventList || eventInvitees.length === 0 || guestRows.trim()) return;
    setGuestRows(eventInvitees.map((guest) => `${guest.name}, ${guest.email}`).join("\n"));
    setPrefilledEventList(true);
  }, [eventInvitees, guestRows, guided, prefilledEventList]);

  const loadSpreadsheet = async (file: File) => {
    try {
      const tables = await readSpreadsheetFile(file);
      const table = tables[0];
      if (!table) throw new Error("The spreadsheet is empty.");
      const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const emailHeader = table.headers.find((header) => normalized(header).includes("email"));
      const fullNameHeader = table.headers.find((header) => ["name", "fullname", "guestname", "attendeename"].includes(normalized(header)));
      const firstNameHeader = table.headers.find((header) => normalized(header) === "firstname");
      const lastNameHeader = table.headers.find((header) => normalized(header) === "lastname");
      if (!emailHeader) throw new Error("The file needs an email column.");
      const lines = table.rows.flatMap((row) => {
        const email = String(row[emailHeader] ?? "").trim();
        const name = fullNameHeader ? String(row[fullNameHeader] ?? "").trim() : [firstNameHeader ? row[firstNameHeader] : null, lastNameHeader ? row[lastNameHeader] : null].filter(Boolean).join(" ").trim();
        return email ? [name ? `${name}, ${email}` : email] : [];
      });
      if (!lines.length) throw new Error("No email rows were found.");
      setGuestRows(lines.join("\n"));
      toast({ title: `${lines.length} guests loaded` });
    } catch (error) {
      toast({ title: "Couldn't read guest list", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const tracking = (invitations ?? []).length > 0 ? <div className="border-t border-hairline pt-4"><p className="mb-2 text-sm font-semibold text-foreground">Delivery tracking</p><ul className="max-h-64 divide-y divide-hairline overflow-auto rounded-lg border border-hairline">{(invitations ?? []).map((invitation) => { const invitationUrl = `${window.location.origin}/api/public/ticket-invitations/${invitation.publicToken}`; return <li key={invitation.id} className="flex items-center gap-2 px-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invitation.recipientName}</p><p className="truncate text-xs text-muted-foreground">{invitation.recipientEmail}</p></div><Pill tone={invitation.status === "registered" ? "success" : invitation.status === "failed" ? "warning" : undefined}>{invitation.status}</Pill><Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(invitationUrl); toast({ title: `Link copied for ${invitation.recipientName}` }); }}><Copy className="mr-1.5 size-3.5" />Copy</Button></li>; })}</ul></div> : null;

  if (guided) return (
    <Panel>
      <PanelHeader title="Review and send invitations" description="Check the exact invitation and RSVP destination before sending it to guests." />
      <section className="grid gap-6 p-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invitation guests receive</p>
          <InvitationPreview design={design} event={event} headline={headline} message={message} timeZone={timeZone} />
          <div className="flex flex-wrap gap-2">
            {onEditDesign ? <Button type="button" variant="outline" onClick={onEditDesign}>Edit invitation design</Button> : null}
            {rsvpPreviewPath ? <Button asChild type="button" variant="outline"><a href={rsvpPreviewPath} target="_blank" rel="noopener noreferrer">Open RSVP page</a></Button> : null}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{hasTickets ? "The RSVP button opens this event's ticket choices." : "This event does not require tickets. The RSVP button opens the event registration page."}</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary-muted/30 p-4 text-sm"><p className="font-semibold text-foreground">Each guest gets their own RSVP link</p><p className="mt-1 text-muted-foreground">Beebizy tracks delivery, opens, and completed responses.</p></div>
          <RecipientEditor id="guided-ticket-invitees" value={guestRows} onChange={setGuestRows} eventInvitees={eventInvitees} onUseEventList={useEventGuestList} onUpload={(file) => void loadSpreadsheet(file)} validCount={recipients.length} />
          <SendControls recipientCount={recipients.length} consent={consent} onConsentChange={setConsent} busy={sendInvitations.isPending || updateEvent.isPending} onSend={() => void send(recipients)} tracking={tracking} />
        </div>
      </section>
    </Panel>
  );

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
          <div className="space-y-1.5"><Label htmlFor="ticket-invite-message">Invitation message</Label><Textarea id="ticket-invite-message" value={design.welcomeMessage} placeholder={event.description || "Tell guests why you would love them to attend."} rows={7} maxLength={2000} onChange={(inputEvent) => setDesign((current) => ({ ...current, welcomeMessage: inputEvent.target.value }))} /><p className="text-xs text-muted-foreground">Use blank lines to create separate paragraphs.</p></div>
          <div className="space-y-1.5"><Label htmlFor="ticket-invite-agenda">Agenda introduction</Label><Textarea id="ticket-invite-agenda" value={design.agendaIntroduction} placeholder="Give guests a short overview of what to expect." rows={4} maxLength={1500} onChange={(inputEvent) => setDesign((current) => ({ ...current, agendaIntroduction: inputEvent.target.value }))} /></div>
          <div className="space-y-2">
            <Label>Invitation image or logo</Label>
            <div className="flex gap-2" role="group" aria-label="Invitation image display style"><Button type="button" size="sm" aria-pressed={design.heroImageDisplay === "banner"} variant={design.heroImageDisplay === "banner" ? "default" : "outline"} onClick={() => setDesign((current) => ({ ...current, heroImageDisplay: "banner" }))}>Banner</Button><Button type="button" size="sm" aria-pressed={design.heroImageDisplay === "logo"} variant={design.heroImageDisplay === "logo" ? "default" : "outline"} onClick={() => setDesign((current) => ({ ...current, heroImageDisplay: "logo" }))}>Logo</Button></div>
            <div className="flex flex-wrap items-center gap-3">
              {design.heroImageUrl ? <img src={design.heroImageUrl} alt="Invitation" className={`h-20 w-32 rounded-lg border border-hairline bg-white ${design.heroImageDisplay === "logo" ? "object-contain p-2" : "object-cover"}`} /> : <div className="grid h-20 w-32 place-items-center rounded-lg border border-dashed border-hairline bg-surface-sunken"><ImagePlus className="size-5 text-muted-foreground" /></div>}
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
          <InvitationPreview design={design} event={event} headline={headline} message={message} timeZone={timeZone} />
        </div>
      </section>

      <section className="grid gap-5 border-b border-hairline p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div><p className="text-sm font-semibold text-foreground">2. Add guests</p><p className="text-xs text-muted-foreground">Enter an email by itself, or use Full name, email. One guest per line.</p></div>
          <RecipientEditor id="ticket-invitees" value={guestRows} onChange={setGuestRows} eventInvitees={eventInvitees} onUseEventList={useEventGuestList} onUpload={(file) => void loadSpreadsheet(file)} validCount={recipients.length} />
        </div>

        <div className="space-y-4">
          <div><p className="text-sm font-semibold text-foreground">3. Preview and send yourself a test</p><p className="text-xs text-muted-foreground">The test uses the exact design and connected ticket link guests will receive.</p></div>
          <div className="flex gap-2"><Input type="email" value={testEmail} onChange={(inputEvent) => setTestEmail(inputEvent.target.value)} placeholder="Your email address" aria-label="Test invitation email" /><Button type="button" variant="outline" disabled={sendInvitations.isPending || updateEvent.isPending || uploadImage.isPending || !testEmail.trim()} onClick={() => void send(parseTicketInvitationRecipients(testEmail), true)}><Eye className="mr-1.5 size-4" />Send test</Button></div>
          <div className="rounded-lg border border-hairline bg-surface-sunken p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">What “View tickets &amp; RSVP” does</p><p className="mt-1">It opens this event's ticket options. The guest selects one ticket type, chooses how many tickets their household needs, enters each ticket holder's name, and confirms or pays.</p></div>
        </div>
      </section>

      <section className="space-y-4 p-5">
        <div><p className="text-sm font-semibold text-foreground">4. Send and track</p><p className="text-xs text-muted-foreground">Every person receives a unique link. Delivery, opens, and completed registrations appear below.</p></div>
        <SendControls recipientCount={recipients.length} consent={consent} onConsentChange={setConsent} busy={sendInvitations.isPending || updateEvent.isPending || uploadImage.isPending} onSend={() => void send(recipients)} tracking={tracking} />
      </section>
    </Panel>
  );
}
