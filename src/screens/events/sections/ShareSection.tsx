/** The organizer-facing builder for the event's public registration site. */

import { useEffect, useState, type CSSProperties } from "react";
import { useLocation, useSearch } from "wouter";
import { Check, Copy, ExternalLink, Eye, Gavel, Globe, Image, ImagePlus, Mail, Palette, Plus, Save, Sparkles, Ticket, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { EmptyState, Panel, PanelHeader, Pill } from "@/components/primitives";
import { useRegistrationCopyGenerator, useSettings, useShareEvent, useSponsorships, useTickets, useUpdateRegistrationPage, useUploadAuctionImage } from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { normalizeAuctionPageSettings } from "@/data/auctionSettings";
import {
  REGISTRATION_PAGE_TEMPLATES,
  normalizeRegistrationPage,
  registrationInvitationHtml,
  registrationPageTemplate,
  type RegistrationInfoPage,
  type RegistrationSpeaker,
  type RegistrationPageSettings,
} from "@/data/registrationPage";
import type { Event, Sponsorship } from "@/data/entities";
import { EVENT_LAUNCH_STEP_IDS, eventLaunchPath, eventLaunchStepHref, type EventLaunchStepId } from "@/data/eventLaunchGuide";
import EventLaunchGuide from "./EventLaunchGuide";
import EventLaunchContextBar from "../EventLaunchContextBar";
import { useEventLaunchProgress } from "../useEventLaunchProgress";
import TicketInvitationBuilder from "./TicketInvitationBuilder";
import GuidedTicketPricing from "./GuidedTicketPricing";
import EventQrCard from "./EventQrCard";
import { formatInZone, localTimeZone } from "@/lib/datetime";

const REGISTRATION_TYPE_PRESETS = [
  { label: "School gala", types: ["Parent/Guardian", "Alumni", "Faculty/Staff", "Friend of school"] },
  { label: "Open event", types: ["Guest"] },
  { label: "Professional", types: ["Attendee", "Sponsor", "Speaker", "Staff"] },
] as const;

const DESIGN_FIELDS: readonly (keyof RegistrationPageSettings)[] = [
  "template", "accentColor", "headline", "aboutHeading", "aboutBody", "agendaIntroduction", "welcomeMessage",
  "heroImageUrl", "heroImageDisplay", "aboutImageUrl", "agendaImageUrl", "paymentUrl", "showAgenda", "showSpeakers", "showSponsors",
  "showVolunteerSignup", "speakers", "registrationTypes", "collectOrganization", "infoPages",
];

function registrationDesignPatch(settings: RegistrationPageSettings): Partial<RegistrationPageSettings> {
  return Object.fromEntries(DESIGN_FIELDS.map((field) => [field, settings[field]])) as Partial<RegistrationPageSettings>;
}

function newSpeaker(): RegistrationSpeaker {
  return {
    id: `speaker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    title: "",
    organization: "",
    bio: "",
    photoUrl: null,
  };
}

function newInfoPage(): RegistrationInfoPage {
  return {
    id: `info-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    navLabel: "",
    title: "",
    body: "",
  };
}

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

function RegistrationPreview({ event, settings, sponsors, hasTickets, timeZone }: { event: Event; settings: RegistrationPageSettings; sponsors: Sponsorship[]; hasTickets: boolean; timeZone: string }) {
  const template = registrationPageTemplate(settings.template);
  const style = { backgroundColor: template.background } as CSSProperties;
  const dateLabel = formatInZone(event.date, timeZone, "dayMonthYearTime");
  const ctaLabel = hasTickets || Boolean(settings.paymentUrl) ? "View registration" : "RSVP";

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline shadow-sm" style={style}>
      {settings.infoPages.length > 0 ? <nav aria-label="Preview information pages" className="flex flex-wrap gap-2 border-b border-hairline bg-background px-5 py-3 text-xs font-semibold"><span className="rounded-full bg-primary px-3 py-1 text-primary-foreground">Event</span>{settings.infoPages.map((page) => <span key={page.id} className="rounded-full border border-hairline px-3 py-1 text-muted-foreground">{page.navLabel}</span>)}</nav> : null}
      <section className="relative isolate min-h-80 overflow-hidden bg-[#17130a] text-white" style={settings.heroImageUrl && settings.heroImageDisplay === "banner" ? { backgroundImage: `url(${settings.heroImageUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
        <div className="absolute inset-0 -z-10 bg-black/65" aria-hidden="true" />
        <div className="flex min-h-80 flex-col justify-end p-6">
          {settings.heroImageUrl && settings.heroImageDisplay === "logo" ? <span className="mb-5 inline-flex w-fit rounded-xl bg-background p-3 shadow-lg"><img src={settings.heroImageUrl} alt="Event logo" className="max-h-16 max-w-40 object-contain" /></span> : null}
          {!settings.heroImageUrl ? <span className="mb-5 grid size-12 place-items-center rounded-xl bg-white/10"><Image className="size-5" aria-hidden="true" /></span> : null}
          <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: settings.accentColor }}>{event.category}</p>
          <h3 className="mt-2 text-3xl font-extrabold tracking-tight">{settings.headline || event.title}</h3>
          <p className="whitespace-pre-line mt-3 text-sm leading-6 text-white/80">{settings.welcomeMessage || event.description || "Join us. Reserve your place below."}</p>
          <dl className="mt-5 grid gap-2 text-xs text-white/85">
            <div><dt className="inline font-bold text-white">When: </dt><dd className="inline">{dateLabel}</dd></div>
            {event.location ? <div><dt className="inline font-bold text-white">Where: </dt><dd className="inline">{event.location}</dd></div> : null}
          </dl>
          <span className="mt-5 inline-flex w-fit rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: settings.accentColor }}>{ctaLabel}</span>
        </div>
      </section>
      <div className="space-y-5 p-6" style={{ backgroundColor: template.surface }}>
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{settings.aboutHeading || "About the event"}</p>
          <p className={`mt-2 whitespace-pre-line text-sm leading-6 ${settings.aboutBody ? "text-slate-600" : "italic text-slate-400"}`}>{settings.aboutBody || "Add an About section so guests know what makes this event special."}</p>
          {settings.aboutImageUrl ? <img src={settings.aboutImageUrl} alt="" className="mt-3 h-28 w-full rounded-xl object-cover" /> : null}
        </section>
        {settings.showAgenda ? <section className="border-t border-hairline pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Agenda</p><p className={`mt-2 whitespace-pre-line text-sm leading-6 ${settings.agendaIntroduction ? "text-slate-600" : "italic text-slate-400"}`}>{settings.agendaIntroduction || "Add an agenda introduction or timed Run of Show items."}</p>{settings.agendaImageUrl ? <img src={settings.agendaImageUrl} alt="" className="mt-3 h-28 w-full rounded-xl object-cover" /> : null}</section> : null}
        <section className="rounded-xl border border-hairline bg-background p-4"><p className="text-xs font-bold text-slate-900">Confirm your attendance</p><p className="mt-1 text-xs leading-5 text-slate-500">Guests choose their guest type, enter their name, and submit their RSVP.</p><span className="mt-3 inline-flex rounded-md px-3 py-2 text-xs font-bold text-white" style={{ backgroundColor: settings.accentColor }}>{ctaLabel}</span></section>
        {settings.showSpeakers ? <section className="border-t border-hairline pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Featured speakers</p>{settings.speakers.length > 0 ? <div className="mt-3 grid grid-cols-2 gap-3">{settings.speakers.slice(0, 4).map((speaker) => <div key={speaker.id} className="rounded-xl bg-surface-sunken p-3">{speaker.photoUrl ? <img src={speaker.photoUrl} alt={speaker.name} className="aspect-square w-full rounded-lg object-cover" /> : <span className="grid aspect-square w-full place-items-center rounded-lg bg-surface-sunken text-lg font-bold text-slate-500">{speaker.name.slice(0, 1)}</span>}<p className="mt-2 text-xs font-bold text-slate-800">{speaker.name}</p><p className="text-[10px] text-slate-500">{speaker.title || speaker.organization}</p></div>)}</div> : <p className="mt-2 text-xs italic text-slate-400">Add speakers if this event has people appearing on stage.</p>}</section> : null}
        {settings.showSponsors ? <section className="border-t border-hairline pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Sponsors</p>{sponsors.length > 0 ? <div className="mt-3 flex flex-wrap items-center gap-4">{sponsors.slice(0, 4).map((sponsor) => sponsor.logoUrl ? <img key={sponsor.id} src={sponsor.logoUrl} alt={sponsor.companyName} className="h-8 w-24 object-contain" /> : <span key={sponsor.id} className="text-xs font-semibold text-slate-500">{sponsor.companyName}</span>)}</div> : <p className="mt-2 text-xs italic text-slate-400">Confirmed sponsor logos will appear here.</p>}</section> : null}
      </div>
    </div>
  );
}

export default function ShareSection({ event }: { event: Event }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const share = useShareEvent();
  const update = useUpdateRegistrationPage();
  const uploadImage = useUploadAuctionImage();
  const generateCopy = useRegistrationCopyGenerator();
  const { data: tickets } = useTickets(event.id);
  const { data: sponsorships } = useSponsorships(event.id);
  const { data: workspaceSettings } = useSettings();
  const [activeWorkspace, setActiveWorkspace] = useState<"design" | "pricing" | "sender" | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [draft, setDraft] = useState<RegistrationPageSettings>(() => ({ ...normalizeRegistrationPage(event.registrationPage), paymentUrl: null }));
  const [guestTypesInput, setGuestTypesInput] = useState(() => normalizeRegistrationPage(event.registrationPage).registrationTypes.join(", "));
  const progress = useEventLaunchProgress(event);
  const requestedStep = EVENT_LAUNCH_STEP_IDS.find((step) => step === new URLSearchParams(search).get("step")) ?? null;
  const requestedStepUnlocked = requestedStep ? progress.unlocked[requestedStep] : false;
  const onSale = (tickets ?? []).filter((ticket) => ticket.isActive);
  const eventUrl = event.shareToken ? absoluteUrl(`/e/${event.shareToken}`) : null;
  const ticketUrl = event.shareToken ? absoluteUrl(`/e/${event.shareToken}/tickets`) : null;
  const auctionUrl = event.auctionPublicToken ? absoluteUrl(`/auction/${event.auctionPublicToken}`) : null;
  const auctionPage = normalizeAuctionPageSettings(event.auctionPage);
  const published = normalizeRegistrationPage(event.registrationPage);
  const inviteMessage = eventUrl
    ? `${published.headline || event.title}\n\n${published.welcomeMessage || event.description || "We would love to see you there."}\n\nView event details and register here: ${eventUrl}\n\nPowered by Beebizy`
    : "";
  const inviteHtml = eventUrl
    ? registrationInvitationHtml(published, event.title, event.description, eventUrl)
    : "";

  const publish = async () => {
    try {
      const registrationPage = normalizeRegistrationPage({ ...draft, paymentUrl: null, registrationTypes: guestTypesInput.split(",") });
      setDraft(registrationPage);
      setGuestTypesInput(registrationPage.registrationTypes.join(", "));
      await update.mutateAsync({ id: event.id, patch: registrationDesignPatch(registrationPage) });
      await share.mutateAsync({ id: event.id });
      toast({ title: "Registration site published", description: "Copy the link and send it to your guests." });
    } catch (error) {
      toast({ title: "Couldn't publish the site", description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const returnToLaunchGuide = () => {
    navigate(eventLaunchPath(event.id), { replace: true });
    setActiveWorkspace(null);
    setShowDetails(false);
    window.requestAnimationFrame(() => document.getElementById("event-launch-guide")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const save = (returnAfterSave = false) => {
    const registrationPage = normalizeRegistrationPage({ ...draft, paymentUrl: null, registrationTypes: guestTypesInput.split(",") });
    setDraft(registrationPage);
    setGuestTypesInput(registrationPage.registrationTypes.join(", "));
    update.mutate(
      { id: event.id, patch: registrationDesignPatch(registrationPage) },
      {
        onSuccess: () => {
          toast({ title: "Registration site saved", description: "The public page now uses this design." });
          if (returnAfterSave) returnToLaunchGuide();
        },
        onError: (error) => toast({ title: "Couldn't save the registration site", description: error.message }),
      },
    );
  };

  const revealInvitationDesign = () => {
    setActiveWorkspace("design");
    setShowDetails(true);
    window.requestAnimationFrame(() => document.getElementById("registration-site-builder")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const revealInvitationSender = () => {
    setActiveWorkspace("sender");
    setShowDetails(false);
    window.requestAnimationFrame(() => document.getElementById("guided-invitation-sender")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const revealTicketPricing = () => {
    setActiveWorkspace("pricing");
    setShowDetails(false);
    window.requestAnimationFrame(() => document.getElementById("guided-ticket-pricing")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const updateSpeaker = (index: number, patch: Partial<RegistrationSpeaker>) => {
    setDraft((current) => ({
      ...current,
      speakers: current.speakers.map((speaker, speakerIndex) => speakerIndex === index ? { ...speaker, ...patch } : speaker),
    }));
  };

  const updateInfoPage = (index: number, patch: Partial<RegistrationInfoPage>) => {
    setDraft((current) => ({
      ...current,
      infoPages: current.infoPages.map((page, pageIndex) => pageIndex === index ? { ...page, ...patch } : page),
    }));
  };

  const draftRegistrationCopy = () => {
    generateCopy.mutate(
      {
        eventId: event.id,
        aboutHeading: draft.aboutHeading,
        aboutBody: draft.aboutBody,
        agendaIntroduction: draft.agendaIntroduction,
      },
      {
        onSuccess: (suggestion) => {
          setDraft((current) => ({
            ...current,
            aboutHeading: suggestion.aboutHeading,
            aboutBody: suggestion.aboutBody,
            agendaIntroduction: suggestion.agendaIntroduction,
          }));
          toast({
            title: "About and agenda drafted",
            description: suggestion.source === "ai" ? "Review the wording, make any edits, then save." : "A clear starter draft is ready to edit and save.",
          });
        },
        onError: (error) => toast({ title: "Couldn't draft the copy", description: error.message }),
      },
    );
  };

  useEffect(() => {
    if (!requestedStep || !requestedStepUnlocked) return;
    if (requestedStep === "invite-design") {
      setActiveWorkspace("design");
      setShowDetails(true);
    } else if (requestedStep === "tickets") {
      setActiveWorkspace("pricing");
      setShowDetails(false);
    } else if (requestedStep === "send") {
      setActiveWorkspace("sender");
      setShowDetails(false);
    } else {
      setActiveWorkspace(null);
      setShowDetails(false);
    }
  }, [requestedStep, requestedStepUnlocked]);

  const selectLaunchStep = (step: EventLaunchStepId) => {
    if (!progress.unlocked[step]) return;
    navigate(eventLaunchStepHref(event.id, step));
  };

  return (
    <div className="space-y-6">
      {activeWorkspace === null ? (
        <div id="event-launch-guide"><EventLaunchGuide event={event} focusStep={requestedStep} publishing={share.isPending || update.isPending} onDesignInvite={revealInvitationDesign} onPublishInvite={() => void publish()} onSendInvites={revealInvitationSender} onPriceTickets={revealTicketPricing} /></div>
      ) : (
        <EventLaunchContextBar
          activeStep={activeWorkspace === "design" ? 3 : activeWorkspace === "pricing" ? 4 : 6}
          eventTitle={event.title}
          onBack={returnToLaunchGuide}
          completion={progress.completion}
          unlocked={progress.unlocked}
          onStepSelect={selectLaunchStep}
        />
      )}
      {activeWorkspace === "pricing" ? <div id="guided-ticket-pricing"><GuidedTicketPricing event={event} onDone={returnToLaunchGuide} /></div> : null}
      {activeWorkspace === "sender" ? <div id="guided-invitation-sender"><TicketInvitationBuilder event={event} guided onDone={returnToLaunchGuide} onEditDesign={revealInvitationDesign} /></div> : null}
      {activeWorkspace === null || activeWorkspace === "design" ? <details className="rounded-xl border border-hairline bg-background" open={showDetails} onToggle={(event) => { setShowDetails(event.currentTarget.open); if (!event.currentTarget.open && activeWorkspace === "design") setActiveWorkspace(null); }}>
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">{activeWorkspace === "design" ? "Invitation design and preview" : "Advanced public links and settings"}</summary>
        <div id="registration-site-builder" className="grid gap-6 border-t border-hairline p-5 2xl:grid-cols-[minmax(0,7fr)_minmax(340px,5fr)]">
      <div className="space-y-6">
        {activeWorkspace === "design" ? <Panel>
          <PanelHeader title="Invitation & RSVP page" description="Design the page guests open from the invitation's RSVP link" actions={<Pill tone={event.shareToken ? "success" : "neutral"}>{event.shareToken ? "Published" : "Not published"}</Pill>} />
          <div className="space-y-6 p-5">
            <fieldset>
              <legend className="flex items-center gap-2 text-sm font-semibold text-foreground"><Palette className="size-4" /> Template</legend>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                {REGISTRATION_PAGE_TEMPLATES.map((template) => {
                  const selected = draft.template === template.id;
                  return (
                    <button key={template.id} type="button" aria-pressed={selected} onClick={() => setDraft((current) => ({ ...current, template: template.id, accentColor: template.accentColor }))} className="rounded-xl border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-sm sm:p-3" style={{ borderColor: selected ? draft.accentColor : undefined, backgroundColor: template.background }}>
                      <span className="mb-2 block h-1.5 rounded-full sm:mb-3 sm:h-2" style={{ backgroundColor: template.accentColor }} />
                      <span className="block text-xs font-semibold text-slate-900 sm:text-sm">{template.name}</span>
                      <span className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block">{template.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <section className="space-y-5 rounded-2xl border border-hairline bg-surface-sunken/40 p-4 sm:p-5">
              <div>
                <h3 className="text-base font-bold text-foreground">Make four quick edits</h3>
                <p className="mt-1 text-sm text-muted-foreground">Pick a color, add a banner or logo, write the welcome, and introduce the agenda. The template handles the rest.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="template-color">1. Color</Label>
                  <div className="flex items-center gap-2">
                    <input id="template-color" type="color" value={draft.accentColor} onChange={(event) => setDraft((current) => ({ ...current, accentColor: event.target.value.toUpperCase() }))} className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-background p-1" />
                    <Input aria-label="Template color hex value" value={draft.accentColor} maxLength={7} onChange={(event) => setDraft((current) => ({ ...current, accentColor: event.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>2. Banner or logo</Label>
                  <div className="flex gap-2" role="group" aria-label="Image display style">
                    <Button type="button" size="sm" aria-pressed={draft.heroImageDisplay === "banner"} variant={draft.heroImageDisplay === "banner" ? "default" : "outline"} onClick={() => setDraft((current) => ({ ...current, heroImageDisplay: "banner" }))}>Banner</Button>
                    <Button type="button" size="sm" aria-pressed={draft.heroImageDisplay === "logo"} variant={draft.heroImageDisplay === "logo" ? "default" : "outline"} onClick={() => setDraft((current) => ({ ...current, heroImageDisplay: "logo" }))}>Logo</Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  {draft.heroImageUrl ? <img src={draft.heroImageUrl} alt={draft.heroImageDisplay === "logo" ? "Event logo" : "Event banner"} className={`h-20 w-32 rounded-lg border border-hairline bg-white ${draft.heroImageDisplay === "logo" ? "object-contain p-2" : "object-cover"}`} /> : <div className="grid h-20 w-32 place-items-center rounded-lg border border-dashed border-hairline bg-background"><Image className="size-5 text-muted-foreground" /></div>}
                  <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                    <Image className="mr-1.5 size-4" />{uploadImage.isPending ? "Uploading..." : draft.heroImageUrl ? "Replace" : "Upload"}
                    <input type="file" accept="image/*" className="sr-only" disabled={uploadImage.isPending} onChange={(inputEvent) => { const file = inputEvent.target.files?.[0]; if (!file) return; uploadImage.mutate(file, { onSuccess: (url) => setDraft((current) => ({ ...current, heroImageUrl: url })), onError: (error) => toast({ title: "Couldn't upload image", description: error.message }) }); }} />
                  </label>
                  {draft.heroImageUrl ? <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, heroImageUrl: null }))}>Remove</Button> : null}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="template-welcome">3. Welcome text</Label>
                  <Textarea id="template-welcome" value={draft.welcomeMessage} maxLength={2000} rows={6} placeholder={event.description ?? "Tell guests why you would love them to attend."} onChange={(event) => setDraft((current) => ({ ...current, welcomeMessage: event.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="template-agenda">4. Agenda introduction</Label><Button asChild type="button" size="sm" variant="ghost"><a href={`/app/events/${event.id}/run-of-show`}>Edit timed agenda</a></Button></div>
                  <Textarea id="template-agenda" value={draft.agendaIntroduction} maxLength={1500} rows={4} placeholder="Give guests a short overview of what to expect." disabled={generateCopy.isPending} onChange={(event) => setDraft((current) => ({ ...current, agendaIntroduction: event.target.value }))} />
                  <p className="text-xs text-muted-foreground">Timed agenda items come from the Run of Show.</p>
                </div>
              </div>
            </section>

            <details className="rounded-xl border border-hairline bg-background">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">More page options</summary>
              <div className="grid gap-4 border-t border-hairline p-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-headline">Main invitation headline</Label>
                <Input id="registration-headline" value={draft.headline} maxLength={120} placeholder={event.title} onChange={(e) => setDraft((current) => ({ ...current, headline: e.target.value }))} />
                <p className="text-xs text-muted-foreground">This replaces the event name in the main hero. It does not create a separate page.</p>
              </div>
              <div className="hidden space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-welcome">Welcome message</Label>
                <Textarea id="registration-welcome" value={draft.welcomeMessage} maxLength={2000} rows={7} placeholder={event.description ?? "Tell guests what makes this event special."} onChange={(e) => setDraft((current) => ({ ...current, welcomeMessage: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Blank lines become separate paragraphs in the preview, invitation email, and public page.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-about-heading">About section heading</Label>
                <Input id="registration-about-heading" value={draft.aboutHeading} maxLength={160} placeholder="About the event" disabled={generateCopy.isPending} onChange={(event) => setDraft((current) => ({ ...current, aboutHeading: event.target.value }))} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:col-span-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Need help with the wording?</p>
                  <p className="mt-1 text-xs text-muted-foreground">Beebizy uses the event details and run of show to create a starter draft. You stay in control and can edit every word.</p>
                </div>
                <Button type="button" variant="outline" onClick={draftRegistrationCopy} disabled={generateCopy.isPending}>
                  <Sparkles className="mr-1.5 size-4" />{generateCopy.isPending ? "Drafting..." : "Draft About & Agenda with AI"}
                </Button>
              </div>
              <div className="hidden space-y-1.5 sm:col-span-2">
                <Label>Large invitation photo</Label>
                <div className="flex flex-wrap items-center gap-3">
                  {draft.heroImageUrl ? <img src={draft.heroImageUrl} alt="Invitation" className="h-20 w-32 rounded-lg border border-hairline object-cover" /> : <div className="grid h-20 w-32 place-items-center rounded-lg border border-dashed border-hairline bg-surface-sunken"><Image className="size-5 text-muted-foreground" /></div>}
                  <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-surface-sunken">
                    <Image className="mr-1.5 size-4" />{uploadImage.isPending ? "Uploading..." : draft.heroImageUrl ? "Replace image" : "Upload image"}
                    <input type="file" accept="image/*" className="sr-only" disabled={uploadImage.isPending} onChange={(inputEvent) => { const file = inputEvent.target.files?.[0]; if (!file) return; uploadImage.mutate(file, { onSuccess: (url) => setDraft((current) => ({ ...current, heroImageUrl: url })), onError: (error) => toast({ title: "Couldn't upload image", description: error.message }) }); }} />
                  </label>
                  {draft.heroImageUrl ? <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, heroImageUrl: null }))}>Remove</Button> : null}
                </div>
                <p className="text-xs text-muted-foreground">This full-width image appears at the top of the invitation email and registration page. Large phone photos resize automatically.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-about-body">About section</Label>
                <Textarea id="registration-about-body" value={draft.aboutBody} maxLength={3000} rows={7} placeholder="Tell guests why you are gathering, who the event is for, and what makes it special." disabled={generateCopy.isPending} onChange={(event) => setDraft((current) => ({ ...current, aboutBody: event.target.value }))} />
                <p className="text-xs text-muted-foreground">This is editable text on the public registration page, not a photo.</p>
              </div>
              <fieldset className="space-y-4 rounded-xl border border-hairline p-4 sm:col-span-2">
                <legend className="px-1 text-sm font-semibold text-foreground">Guest information pages</legend>
                <div><p className="text-xs leading-5 text-muted-foreground">Create separate tabs such as Room block, Travel, Parking, or Dress code. These pages do not change the event title or main invitation.</p></div>
                {draft.infoPages.length === 0 ? <div className="rounded-lg border border-dashed border-hairline bg-surface-sunken p-4 text-center text-xs text-muted-foreground">No extra information pages yet.</div> : null}
                <div className="space-y-4">
                  {draft.infoPages.map((page, index) => (
                    <div key={page.id} className="grid gap-3 rounded-xl border border-hairline bg-background p-4 sm:grid-cols-2">
                      <div className="space-y-1"><Label htmlFor={`info-nav-${index}`}>Tab label</Label><Input id={`info-nav-${index}`} value={page.navLabel} maxLength={40} placeholder="Room block" onChange={(inputEvent) => updateInfoPage(index, { navLabel: inputEvent.target.value })} /></div>
                      <div className="space-y-1"><Label htmlFor={`info-title-${index}`}>Page heading</Label><Input id={`info-title-${index}`} value={page.title} maxLength={160} placeholder="Hotel room block" onChange={(inputEvent) => updateInfoPage(index, { title: inputEvent.target.value })} /></div>
                      <div className="space-y-1 sm:col-span-2"><Label htmlFor={`info-body-${index}`}>Page details</Label><Textarea id={`info-body-${index}`} value={page.body} maxLength={4000} rows={5} placeholder="Add the booking link, deadline, address, and any instructions guests need." onChange={(inputEvent) => updateInfoPage(index, { body: inputEvent.target.value })} /></div>
                      <div className="flex justify-end sm:col-span-2"><Button type="button" size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, infoPages: current.infoPages.filter((_, pageIndex) => pageIndex !== index) }))}><Trash2 className="mr-1.5 size-4" aria-hidden="true" />Remove page</Button></div>
                    </div>
                  ))}
                </div>
                <Button type="button" size="sm" variant="outline" disabled={draft.infoPages.length >= 6} onClick={() => setDraft((current) => ({ ...current, infoPages: [...current.infoPages, newInfoPage()] }))}><Plus className="mr-1.5 size-4" aria-hidden="true" />Add information page</Button>
              </fieldset>
              <div className="hidden space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-agenda-introduction">Agenda introduction</Label>
                <Textarea id="registration-agenda-introduction" value={draft.agendaIntroduction} maxLength={1500} rows={5} placeholder="Give guests a short overview of what to expect before the detailed schedule." disabled={generateCopy.isPending} onChange={(event) => setDraft((current) => ({ ...current, agendaIntroduction: event.target.value }))} />
                <p className="text-xs text-muted-foreground">The timed agenda below still comes from the run of show.</p>
              </div>
              <fieldset className="space-y-3 rounded-xl border border-hairline p-4 sm:col-span-2">
                <legend className="px-1 text-sm font-semibold text-foreground">Featured speakers</legend>
                <p className="text-xs text-muted-foreground">Add up to eight speakers. Their photos and public details appear on the registration page.</p>
                {draft.speakers.length === 0 ? <div className="rounded-lg border border-dashed border-hairline bg-surface-sunken p-4 text-center text-xs text-muted-foreground">No speakers added yet.</div> : null}
                <div className="space-y-4">
                  {draft.speakers.map((speaker, index) => (
                    <div key={speaker.id} className="grid gap-3 rounded-xl border border-hairline p-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
                      <div className="space-y-2">
                        {speaker.photoUrl ? <img src={speaker.photoUrl} alt={speaker.name || `Speaker ${index + 1}`} className="aspect-[4/3] w-28 rounded-xl object-cover" /> : <div className="grid aspect-[4/3] w-28 place-items-center rounded-xl border border-dashed border-hairline bg-surface-sunken"><UserRound className="size-6 text-muted-foreground" aria-hidden="true" /></div>}
                        <label className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-input bg-background px-2.5 text-[11px] font-semibold hover:bg-accent"><ImagePlus className="mr-1 size-3.5" aria-hidden="true" />{uploadImage.isPending ? "Uploading..." : speaker.photoUrl ? "Replace" : "Upload photo"}<input type="file" accept="image/*" className="sr-only" disabled={uploadImage.isPending} onChange={(inputEvent) => { const file = inputEvent.target.files?.[0]; if (!file) return; uploadImage.mutate(file, { onSuccess: (url) => updateSpeaker(index, { photoUrl: url }), onError: (error) => toast({ title: "Couldn't upload speaker photo", description: error.message }) }); }} /></label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1"><Label htmlFor={`speaker-name-${index}`}>Name</Label><Input id={`speaker-name-${index}`} value={speaker.name} maxLength={120} onChange={(event) => updateSpeaker(index, { name: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor={`speaker-title-${index}`}>Title</Label><Input id={`speaker-title-${index}`} value={speaker.title} maxLength={120} onChange={(event) => updateSpeaker(index, { title: event.target.value })} /></div>
                        <div className="space-y-1 sm:col-span-2"><Label htmlFor={`speaker-organization-${index}`}>Organization</Label><Input id={`speaker-organization-${index}`} value={speaker.organization} maxLength={120} onChange={(event) => updateSpeaker(index, { organization: event.target.value })} /></div>
                        <div className="space-y-1 sm:col-span-2"><Label htmlFor={`speaker-bio-${index}`}>Short biography</Label><Textarea id={`speaker-bio-${index}`} value={speaker.bio} maxLength={500} rows={2} onChange={(event) => updateSpeaker(index, { bio: event.target.value })} /></div>
                        <div className="flex justify-end sm:col-span-2"><Button type="button" size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, speakers: current.speakers.filter((_, speakerIndex) => speakerIndex !== index) }))}><Trash2 className="mr-1.5 size-4" aria-hidden="true" />Remove speaker</Button></div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" size="sm" variant="outline" disabled={draft.speakers.length >= 8} onClick={() => setDraft((current) => ({ ...current, speakers: [...current.speakers, newSpeaker()] }))}><Plus className="mr-1.5 size-4" aria-hidden="true" />Add speaker</Button>
              </fieldset>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="registration-types">Guest types</Label>
                <Input id="registration-types" value={guestTypesInput} placeholder="General, VIP, Speaker" onChange={(e) => setGuestTypesInput(e.target.value)} />
                <div className="flex flex-wrap gap-2 pt-1">
                  {REGISTRATION_TYPE_PRESETS.map((preset) => <Button key={preset.label} type="button" size="sm" variant="outline" onClick={() => setGuestTypesInput(preset.types.join(", "))}>{preset.label}</Button>)}
                </div>
                <p className="text-xs text-muted-foreground">These labels are customer-facing. Choose a preset or enter client-specific types separated by commas. Guests select one when they register.</p>
              </div>
              <div className="hidden space-y-1.5">
                <Label htmlFor="registration-color">Brand color</Label>
                <div className="flex items-center gap-2">
                  <input id="registration-color" type="color" value={draft.accentColor} onChange={(e) => setDraft((current) => ({ ...current, accentColor: e.target.value.toUpperCase() }))} className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1" />
                  <Input aria-label="Brand color hex value" value={draft.accentColor} maxLength={7} onChange={(e) => setDraft((current) => ({ ...current, accentColor: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-3 rounded-lg border border-hairline p-3">
                <div><label className="flex items-center justify-between gap-3 text-sm"><span>Ask for company, school, or organization</span><Switch checked={draft.collectOrganization} onCheckedChange={(checked) => setDraft((current) => ({ ...current, collectOrganization: checked }))} /></label><p className="mt-1 pr-12 text-xs text-muted-foreground">Adds an optional field so guests can name the business, school, nonprofit, or group they represent.</p></div>
                <label className="flex items-center justify-between gap-3 text-sm"><span>Show public agenda</span><Switch checked={draft.showAgenda} onCheckedChange={(checked) => setDraft((current) => ({ ...current, showAgenda: checked }))} /></label>
                <label className="flex items-center justify-between gap-3 text-sm"><span>Show featured speakers</span><Switch checked={draft.showSpeakers} onCheckedChange={(checked) => setDraft((current) => ({ ...current, showSpeakers: checked }))} /></label>
                <label className="flex items-center justify-between gap-3 text-sm"><span>Show confirmed sponsors</span><Switch checked={draft.showSponsors} onCheckedChange={(checked) => setDraft((current) => ({ ...current, showSponsors: checked }))} /></label>
                <label className="flex items-center justify-between gap-3 text-sm"><span>Show volunteer signup</span><Switch checked={draft.showVolunteerSignup} onCheckedChange={(checked) => setDraft((current) => ({ ...current, showVolunteerSignup: checked }))} /></label>
              </div>
              </div>
            </details>
            <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
              <Button onClick={() => save(true)} disabled={update.isPending}><Save className="mr-1.5 size-4" /> {update.isPending ? "Saving..." : "Save invitation and continue"}</Button>
              {eventUrl ? <Button asChild variant="outline"><a href={eventUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 size-4" />Open live page</a></Button> : null}
            </div>
          </div>
        </Panel> : null}

        {activeWorkspace !== "design" ? <>{event.shareToken && eventUrl ? (
          <Panel>
            <PanelHeader title="Invite guests" description="The registration link works without a Beebizy login" actions={<Pill tone="success">Live</Pill>} />
            <div className="divide-y divide-hairline">
              <CopyRow label="Registration site" url={eventUrl} hint="Event details and registration" />
              <EventQrCard eventTitle={event.title} url={eventUrl} />
              {onSale.length > 0 && ticketUrl ? <CopyRow label="Ticket checkout" url={ticketUrl} hint={`${onSale.length} ticket type${onSale.length === 1 ? "" : "s"}`} /> : null}
              {auctionUrl ? <CopyRow label="Bidder auction" url={auctionUrl} hint="Public mobile bidding" /> : null}
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

        <Panel>
          <PanelHeader title="Bidder-facing auction" description="This is the mobile page guests use to get a paddle, browse items, and bid" actions={auctionUrl ? <Pill tone={auctionPage.catalogPublished ? "success" : "warning"}>{auctionPage.catalogPublished ? "Live" : "Preview ready"}</Pill> : <Pill>Not created</Pill>} />
          {auctionUrl ? <div className="divide-y divide-hairline"><CopyRow label="Public bidder page" url={auctionUrl} hint={auctionPage.catalogPublished ? "No organizer login required" : "Registration open; catalog still hidden"} /><div className="px-5 py-4 text-xs text-muted-foreground">{auctionPage.catalogPublished ? "This link also appears on the public event page as “Open auction.”" : "Guests can receive a paddle now. Unpublished auction items remain hidden until the catalog is ready."}</div></div> : <EmptyState icon={Gavel} title="The bidder page has not been created" description="Open Fundraising and create the donor and bidder links. Beebizy will then place the auction button on this public registration site." action={<Button asChild><a href={`/app/events/${event.id}/fundraising`}><Gavel className="mr-1.5 size-4" />Open fundraising setup</a></Button>} />}
        </Panel>

        {onSale.length > 0 ? (
          <Panel>
            <PanelHeader title="Ticket options" description="These appear automatically on the registration site" />
            <ul className="divide-y divide-hairline">
              {onSale.map((ticket) => <li key={ticket.id} className="flex items-center gap-3 px-5 py-3"><Ticket className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{ticket.name}</p><p className="truncate text-xs text-muted-foreground">{ticket.description || "Registration option"}</p></div><span data-numeric className="text-sm font-semibold">{formatMoney(ticket.priceCents)}</span></li>)}
            </ul>
          </Panel>
        ) : null}</> : null}
      </div>

      <div className="space-y-6">
        {activeWorkspace === "design" ? <Panel><PanelHeader title="RSVP page preview" description="This is the page guests open from the invitation link" /><div className="p-4"><RegistrationPreview event={event} settings={normalizeRegistrationPage(draft)} sponsors={(sponsorships ?? []).filter((sponsor) => sponsor.status === "confirmed")} hasTickets={onSale.length > 0} timeZone={event.timeZone ?? workspaceSettings?.timeZone ?? localTimeZone()} /></div></Panel> : null}
        {activeWorkspace !== "design" ? <Panel>
          <PanelHeader title="What guests can access" description="Only the public event experience" />
          <div className="space-y-3 px-5 py-4 text-sm">
            <div className="flex items-start gap-2.5"><Eye className="mt-0.5 size-4 shrink-0 text-success-text" /><p><span className="font-medium">Visible:</span> registration branding, event details, registration form, selected agenda, volunteer openings, tickets on sale, and the bidder auction when it is live.</p></div>
            <div className="flex items-start gap-2.5"><Eye className="mt-0.5 size-4 shrink-0 text-danger-text" /><p><span className="font-medium">Never visible:</span> budgets, vendor fees, guest contact details, internal checklists, sponsorship amounts, or bids.</p></div>
            <p className="border-t border-hairline pt-3 text-xs text-muted-foreground">Every submission is added directly to this event's registration list, ready for filtering and check-in.</p>
          </div>
        </Panel> : null}
      </div>
        </div>
      </details> : null}
    </div>
  );
}
