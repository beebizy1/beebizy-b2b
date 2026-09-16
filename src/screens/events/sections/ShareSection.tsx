/** The organizer-facing builder for the event's public registration site. */

import { useState, type CSSProperties } from "react";
import { Check, Copy, ExternalLink, Eye, Globe, Image, Mail, Palette, Save, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { EmptyState, Panel, PanelHeader, Pill } from "@/components/primitives";
import { useShareEvent, useTickets, useUpdateEvent } from "@/data/hooks";
import { formatMoney } from "@/data/money";
import {
  REGISTRATION_PAGE_TEMPLATES,
  normalizeRegistrationPage,
  registrationInvitationHtml,
  registrationPageTemplate,
  type RegistrationPageSettings,
} from "@/data/registrationPage";
import type { Event } from "@/data/entities";

function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

async function copyText(value: string, success: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast({ title: success });
  } catch {
    toast({ title: "Couldn't copy", description: "Select the text and copy it manually." });
  }
}

async function copyDesignedInvitation(html: string, plain: string): Promise<void> {
  try {
    if (!navigator.clipboard.write || typeof ClipboardItem === "undefined") {
      await copyText(plain, "Invitation text copied");
      return;
    }
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plain], { type: "text/plain" }),
    })]);
    toast({ title: "Designed invitation copied", description: "Paste it into your email composer and add recipients." });
  } catch {
    await copyText(plain, "Invitation text copied");
  }
}

function CopyRow({ label, url, hint }: { label: string; url: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Couldn't copy", description: "Select the link and copy it manually." });
    }
  };

  return (
    <div className="space-y-1.5 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={`${label} URL`} className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-sunken px-3 py-2 font-mono text-xs text-foreground" />
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? <Check className="mr-1.5 size-3.5 text-success-text" /> : <Copy className="mr-1.5 size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}><ExternalLink className="size-3.5" /></a>
        </Button>
      </div>
    </div>
  );
}

function RegistrationPreview({ event, settings }: { event: Event; settings: RegistrationPageSettings }) {
  const template = registrationPageTemplate(settings.template);
  const style = { backgroundColor: template.background } as CSSProperties;

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline shadow-sm" style={style}>
      {settings.heroImageUrl ? (
        <div className="h-40 bg-cover bg-center" style={{ backgroundImage: `url(${settings.heroImageUrl})` }} />
      ) : (
        <div className="grid h-24 place-items-center" style={{ backgroundColor: `${settings.accentColor}18` }}>
          <Image className="size-6" style={{ color: settings.accentColor }} aria-hidden="true" />
        </div>
      )}
      <div className="space-y-4 p-6" style={{ backgroundColor: template.surface }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: settings.accentColor }}>{event.category}</p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{settings.headline || event.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{settings.welcomeMessage || event.description || "Join us. Reserve your place below."}</p>
        </div>
        <span className="inline-flex rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: settings.accentColor }}>Register now</span>
      </div>
    </div>
  );
}

export default function ShareSection({ event }: { event: Event }) {
  const share = useShareEvent();
  const update = useUpdateEvent();
  const { data: tickets } = useTickets(event.id);
  const [draft, setDraft] = useState<RegistrationPageSettings>(() => normalizeRegistrationPage(event.registrationPage));
  const [guestTypesInput, setGuestTypesInput] = useState(() => normalizeRegistrationPage(event.registrationPage).registrationTypes.join(", "));
  const onSale = (tickets ?? []).filter((ticket) => ticket.isActive);
  const eventUrl = event.shareToken ? absoluteUrl(`/e/${event.shareToken}`) : null;
  const ticketUrl = event.shareToken ? absoluteUrl(`/e/${event.shareToken}/tickets`) : null;
  const published = normalizeRegistrationPage(event.registrationPage);
  const inviteMessage = eventUrl
    ? `${published.headline || event.title}\n\n${published.welcomeMessage || event.description || "We would love to see you there."}\n\nRegister here: ${eventUrl}`
    : "";
  const inviteHtml = eventUrl
    ? registrationInvitationHtml(published, event.title, event.description, eventUrl)
    : "";

  const publish = async () => {
    try {
      const registrationPage = normalizeRegistrationPage({ ...draft, registrationTypes: guestTypesInput.split(",") });
      setDraft(registrationPage);
      setGuestTypesInput(registrationPage.registrationTypes.join(", "));
      await update.mutateAsync({ id: event.id, patch: { registrationPage } });
      await share.mutateAsync({ id: event.id });
      toast({ title: "Registration site published", description: "Copy the link and send it to your guests." });
    } catch (error) {
      toast({ title: "Couldn't publish the site", description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const save = () => {
    const registrationPage = normalizeRegistrationPage({ ...draft, registrationTypes: guestTypesInput.split(",") });
    setDraft(registrationPage);
    setGuestTypesInput(registrationPage.registrationTypes.join(", "));
    update.mutate(
      { id: event.id, patch: { registrationPage } },
      {
        onSuccess: () => toast({ title: "Registration site saved", description: "The public page now uses this design." }),
        onError: (error) => toast({ title: "Couldn't save the registration site", description: error.message }),
      },
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(340px,5fr)]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Registration site builder" description="Choose a starting point, then make the guest page match this event" actions={<Pill tone={event.shareToken ? "success" : "neutral"}>{event.shareToken ? "Published" : "Not published"}</Pill>} />
          <div className="space-y-6 p-5">
            <fieldset>
              <legend className="flex items-center gap-2 text-sm font-semibold text-foreground"><Palette className="size-4" /> Template</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {REGISTRATION_PAGE_TEMPLATES.map((template) => {
                  const selected = draft.template === template.id;
                  return (
                    <button key={template.id} type="button" aria-pressed={selected} onClick={() => setDraft((current) => ({ ...current, template: template.id, accentColor: template.accentColor }))} className="rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm" style={{ borderColor: selected ? draft.accentColor : undefined, backgroundColor: template.background }}>
                      <span className="mb-3 block h-2 rounded-full" style={{ backgroundColor: template.accentColor }} />
                      <span className="block text-sm font-semibold text-slate-900">{template.name}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">{template.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-headline">Headline</Label>
                <Input id="registration-headline" value={draft.headline} maxLength={120} placeholder={event.title} onChange={(e) => setDraft((current) => ({ ...current, headline: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-welcome">Welcome message</Label>
                <Textarea id="registration-welcome" value={draft.welcomeMessage} maxLength={600} rows={4} placeholder={event.description ?? "Tell guests what makes this event special."} onChange={(e) => setDraft((current) => ({ ...current, welcomeMessage: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-hero">Hero image URL</Label>
                <Input id="registration-hero" type="url" value={draft.heroImageUrl ?? ""} placeholder="https://example.com/event-photo.jpg" onChange={(e) => setDraft((current) => ({ ...current, heroImageUrl: e.target.value || null }))} />
                <p className="text-xs text-muted-foreground">Use a public HTTPS image link. This image is separate from the internal mood board.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-types">Guest types</Label>
                <Input id="registration-types" value={guestTypesInput} placeholder="General, VIP, Speaker" onChange={(e) => setGuestTypesInput(e.target.value)} />
                <p className="text-xs text-muted-foreground">Separate each type with a comma. Guests choose one when they register, and it appears in the segmented list.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="registration-color">Brand color</Label>
                <div className="flex items-center gap-2">
                  <input id="registration-color" type="color" value={draft.accentColor} onChange={(e) => setDraft((current) => ({ ...current, accentColor: e.target.value.toUpperCase() }))} className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1" />
                  <Input aria-label="Brand color hex value" value={draft.accentColor} maxLength={7} onChange={(e) => setDraft((current) => ({ ...current, accentColor: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-3 rounded-lg border border-hairline p-3">
                <label className="flex items-center justify-between gap-3 text-sm"><span>Ask for organization</span><Switch checked={draft.collectOrganization} onCheckedChange={(checked) => setDraft((current) => ({ ...current, collectOrganization: checked }))} /></label>
                <label className="flex items-center justify-between gap-3 text-sm"><span>Show public agenda</span><Switch checked={draft.showAgenda} onCheckedChange={(checked) => setDraft((current) => ({ ...current, showAgenda: checked }))} /></label>
                <label className="flex items-center justify-between gap-3 text-sm"><span>Show volunteer signup</span><Switch checked={draft.showVolunteerSignup} onCheckedChange={(checked) => setDraft((current) => ({ ...current, showVolunteerSignup: checked }))} /></label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
              <Button onClick={save} disabled={update.isPending}><Save className="mr-1.5 size-4" /> {update.isPending ? "Saving..." : "Save design"}</Button>
              {eventUrl ? <Button asChild variant="outline"><a href={eventUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 size-4" />Open live page</a></Button> : null}
            </div>
          </div>
        </Panel>

        {event.shareToken && eventUrl ? (
          <Panel>
            <PanelHeader title="Invite guests" description="The registration link works without a Beebizy login" actions={<Pill tone="success">Live</Pill>} />
            <div className="divide-y divide-hairline">
              <CopyRow label="Registration site" url={eventUrl} hint="Event details and registration" />
              {onSale.length > 0 && ticketUrl ? <CopyRow label="Ticket checkout" url={ticketUrl} hint={`${onSale.length} ticket type${onSale.length === 1 ? "" : "s"}`} /> : null}
            </div>
            <div className="border-t border-hairline p-5">
              <Label htmlFor="invite-copy">Ready-to-send invitation</Label>
              <Textarea id="invite-copy" readOnly value={inviteMessage} rows={5} className="mt-2" onFocus={(e) => e.currentTarget.select()} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void copyDesignedInvitation(inviteHtml, inviteMessage)}><Copy className="mr-1.5 size-4" /> Copy designed invitation</Button>
                <Button asChild variant="outline" size="sm"><a href={`mailto:?subject=${encodeURIComponent(published.headline || event.title)}&body=${encodeURIComponent(inviteMessage)}`}><Mail className="mr-1.5 size-4" /> Open email draft</a></Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Paste the designed version into your email composer, or open a plain-text draft. Beebizy does not send bulk invitation emails from this screen.</p>
            </div>
          </Panel>
        ) : (
          <Panel>
            <PanelHeader title="Publish registration site" description="Nothing about this event is public until you turn sharing on" />
            <EmptyState icon={Globe} title="Your design is private" description="Publish when it is ready. Beebizy will create one guest link for event details and registration." action={
              <Button disabled={share.isPending || update.isPending} onClick={() => void publish()}>
                <Globe className="mr-1.5 size-4" /> {share.isPending || update.isPending ? "Publishing..." : "Publish registration site"}
              </Button>
            } />
          </Panel>
        )}

        {onSale.length > 0 ? (
          <Panel>
            <PanelHeader title="Ticket options" description="These appear automatically on the registration site" />
            <ul className="divide-y divide-hairline">
              {onSale.map((ticket) => <li key={ticket.id} className="flex items-center gap-3 px-5 py-3"><Ticket className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{ticket.name}</p><p className="truncate text-xs text-muted-foreground">{ticket.description || "Registration option"}</p></div><span data-numeric className="text-sm font-semibold">{formatMoney(ticket.priceCents)}</span></li>)}
            </ul>
          </Panel>
        ) : null}
      </div>

      <div className="space-y-6">
        <Panel><PanelHeader title="Live preview" description="Guests see this look and feel" /><div className="p-4"><RegistrationPreview event={event} settings={normalizeRegistrationPage(draft)} /></div></Panel>
        <Panel>
          <PanelHeader title="What guests can access" description="Only the public event experience" />
          <div className="space-y-3 px-5 py-4 text-sm">
            <div className="flex items-start gap-2.5"><Eye className="mt-0.5 size-4 shrink-0 text-success-text" /><p><span className="font-medium">Visible:</span> registration branding, event details, registration form, selected agenda, volunteer openings, and tickets on sale.</p></div>
            <div className="flex items-start gap-2.5"><Eye className="mt-0.5 size-4 shrink-0 text-danger-text" /><p><span className="font-medium">Never visible:</span> budgets, vendor fees, guest contact details, internal checklists, sponsorship amounts, or bids.</p></div>
            <p className="border-t border-hairline pt-3 text-xs text-muted-foreground">Every submission is added directly to this event's registration list, ready for filtering and check-in.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
