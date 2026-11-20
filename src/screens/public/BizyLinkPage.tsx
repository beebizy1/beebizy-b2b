import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GuestDraftStatus } from "@/components/GuestDraftStatus";
import { bizyPublicRequest, type BizyPublicPayload } from "@/data/bizyLink";
import { RegistrationGuestDraftRecovery, type RegistrationGuestDraft } from "@/data/registrationGuestDraft";
import { formatInZone, timeZoneLabel } from "@/lib/datetime";

export default function BizyLinkPage({ token }: { token: string }) {
  const search = useSearch(); const access = new URLSearchParams(search).get("access") ?? "";
  const path = `${encodeURIComponent(token)}${access ? `?access=${encodeURIComponent(access)}` : ""}`;
  const query = useQuery({ queryKey: ["bizy-public", token, access], queryFn: () => bizyPublicRequest<BizyPublicPayload>(path), retry: false });
  const retryableError = query.error instanceof TypeError || query.error instanceof SyntaxError;
  useEffect(() => { const before = document.title; document.title = query.data ? `${query.data.eventTitle} | Bizy Link` : "Bizy Link | Beebizy"; return () => { document.title = before; }; }, [query.data]);
  return <main className="min-h-dvh bg-primary-wash px-4 py-8"><div className="mx-auto max-w-3xl space-y-6"><BrandLogo size="lg" /><div className="rounded-2xl border border-hairline bg-white p-5 sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your event, made easy · Bizy Link</p>
    <h1 className="my-4 text-3xl font-bold tracking-tight">{query.data?.eventTitle ?? "Welcome"}</h1>
    {query.data?.eventDate && query.data.timeZone ? <p className="mb-5 text-sm text-muted-foreground">{formatInZone(query.data.eventDate, query.data.timeZone, "full")} {timeZoneLabel(query.data.timeZone, new Date(query.data.eventDate))}{query.data.eventEndDate ? <span className="mt-1 block">Ends {formatInZone(query.data.eventEndDate, query.data.timeZone, "full")} {timeZoneLabel(query.data.timeZone, new Date(query.data.eventEndDate))}</span> : null}{query.data.location ? <span className="mt-1 block">{query.data.location}</span> : null}</p> : null}
    {query.error ? <div role="alert" className="space-y-3"><p>{retryableError ? "We could not connect to this event. Check your connection and try again." : query.error instanceof Error ? query.error.message : "This link could not load."}</p><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Opening…" : "Try again"}</Button></div> : null}
    {!query.data ? query.error ? null : <p>Opening your event…</p> : query.error && !retryableError ? null : query.data.partner ? <PartnerForm key={`${token}:${access}`} path={path} token={token} access={access} data={query.data} refresh={() => void query.refetch()} /> : <div className="space-y-5"><p className="text-sm text-muted-foreground">Start here. You do not need a Beebizy account or password.</p><div className="grid gap-3 sm:grid-cols-2">{query.data.guestTypes.map(type => <Button key={type} className="h-auto justify-between whitespace-normal p-5 text-left" asChild><Link href={`/e/${token}/register/${encodeURIComponent(type)}`}>{query.data.guestTypes.length === 1 ? "Register for this event" : `Register as ${type}`}<span aria-hidden="true">→</span></Link></Button>)}</div><p className="text-sm text-muted-foreground">You can enter your details, add guests when the event allows it, and select apparel sizes on the registration form.</p>{query.data.contributionLinks.length ? <section className="space-y-3 border-t border-hairline pt-5"><h2 className="font-semibold">Make a contribution</h2>{query.data.contributionLinks.map(campaign => <Button asChild key={campaign.token} variant="outline"><Link href={`/give/${campaign.token}`}>{campaign.title}</Link></Button>)}</section> : null}<section className="border-t border-hairline pt-5"><h2 className="font-semibold">Here as a sponsor or vendor?</h2><p className="mt-2 text-sm text-muted-foreground">Open the personal Bizy Link your organizer shared with you. It takes you straight to your guest roster or vendor schedule.</p></section><Button asChild variant="outline"><Link href={`/e/${token}`}>View event details</Link></Button></div>}
    {query.data?.partner && query.data.contributionLinks.length ? <section className="mt-6 space-y-3 border-t border-hairline pt-5"><h2 className="font-semibold">Contribute to this event</h2>{query.data.contributionLinks.map(campaign => <Button asChild key={campaign.token} variant="outline"><Link href={`/give/${campaign.token}`}>{campaign.title}</Link></Button>)}</section> : null}
  </div></div></main>;
}

type Person = { firstName: string; lastName: string; email: string; answers: Record<string, string> };
const blankPerson = (): Person => ({ firstName: "", lastName: "", email: "", answers: {} });

function PartnerForm({ path, token, access, data, refresh }: { path: string; token: string; access: string; data: BizyPublicPayload; refresh(): void }) {
  const partner = data.partner!; const schedule = partner.schedule ?? { arrivalTime: "", serviceTime: "", departureTime: "", notes: "" };
  const initial = { people: JSON.stringify([blankPerson()]), schedule: JSON.stringify(schedule), expected: JSON.stringify(schedule) };
  const draftPath = `${encodeURIComponent(token)}/draft?access=${encodeURIComponent(access)}`;
  const recovery = useMemo(() => new RegistrationGuestDraftRecovery({
    get: () => bizyPublicRequest<RegistrationGuestDraft | null>(draftPath),
    save: async (_eventId, _key, value) => {
      const saved = await bizyPublicRequest<RegistrationGuestDraft | null>(draftPath, value, "PUT");
      if (!saved) throw new Error("Your recovery draft could not be saved.");
      return saved;
    },
  }, token, "partner", `beebizy:partner:${token}:${access}`, { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, false, initial),
  // Keep the same recovery session while a save refetches the partner payload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [token, access]);
  const [state, setState] = useState(recovery.state); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { void recovery.start(setState); return () => recovery.stop(); }, [recovery]);
  const values = state.discarded ? initial : state.values;
  const people: Person[] = JSON.parse(values.people ?? initial.people);
  const currentSchedule: typeof schedule = JSON.parse(values.schedule ?? initial.schedule);
  const change = (patch: Record<string, string>) => recovery.setValues({ ...values, ...patch });
  async function submit() {
    setBusy(true); setMessage(""); const expected = { ...state.values };
    try {
      await bizyPublicRequest(path, partner.role === "sponsor" ? { people } : { schedule: currentSchedule, expected: JSON.parse(values.expected ?? initial.expected) });
      recovery.complete(expected, { ...values, expected: JSON.stringify(currentSchedule) });
      setMessage(partner.role === "sponsor" ? "Your guests are registered. Your organizer now has the roster and sizes." : "Your times are saved. Your organizer can see them now.");
      refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save. Your draft is protected."); }
    finally { setBusy(false); }
  }
  if (partner.role === "sponsor" && partner.submitted) return <div role="status" className="space-y-3"><h2 className="text-lg font-semibold">Your guest list is confirmed</h2><p className="text-sm">Thank you, {partner.name}. Your organizer can see your guest names and sizes. Ask them if you need to change the list.</p></div>;
  return <form className="space-y-5" onSubmit={e => { e.preventDefault(); void submit(); }}><fieldset disabled={busy} className="min-w-0 space-y-5"><h2 className="text-lg font-semibold">{partner.name} · {partner.role === "sponsor" ? "Your guest list" : "Your event-day times"}</h2><p className="text-sm text-muted-foreground">{partner.role === "sponsor" ? `Add up to ${partner.seatLimit} ${partner.seatLimit === 1 ? "guest" : "guests"} by name. Emails are optional. Confirm the list when everyone is ready.` : "Tell us when you will arrive, start serving, and leave. Your organizer will see the changes in the event schedule."}</p><GuestDraftStatus state={partner.role === "vendor" ? { ...state, message: state.message.replace("guest details", "vendor details").replace("guest draft", "vendor draft").replace("Submit to apply these details.", "Use Save my times to apply them.") } : state} recovery={recovery} />
    {partner.role === "sponsor" ? <>{people.map((person, index) => {
      const patch = (value: Partial<Person>) => change({ people: JSON.stringify(people.map((row, i) => i === index ? { ...row, ...value } : row)) });
      return <fieldset className="space-y-3 rounded-xl border border-hairline p-4" key={index}><legend className="px-2 text-sm font-semibold">Guest {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">First name<Input required maxLength={120} value={person.firstName} onChange={e => patch({ firstName: e.target.value })} /></label><label className="space-y-1 text-sm">Last name<Input required maxLength={120} value={person.lastName} onChange={e => patch({ lastName: e.target.value })} /></label></div><label className="block space-y-1 text-sm">Email (optional)<Input type="email" maxLength={320} value={person.email} onChange={e => patch({ email: e.target.value })} /></label>{partner.questions.map(question => <label className="block space-y-1 text-sm" key={question.id}>{question.label}{question.required ? " (required)" : ""}{question.type === "select" ? <select required={question.required} className="block h-10 w-full rounded border border-input bg-background px-2" value={person.answers[question.id] ?? ""} onChange={e => patch({ answers: { ...person.answers, [question.id]: e.target.value } })}><option value="">Choose one</option>{question.options.map(option => <option key={option}>{option}</option>)}</select> : <Input required={question.required} value={person.answers[question.id] ?? ""} onChange={e => patch({ answers: { ...person.answers, [question.id]: e.target.value } })} />}</label>)}{people.length > 1 ? <Button type="button" variant="ghost" onClick={() => change({ people: JSON.stringify(people.filter((_, i) => i !== index)) })}>Remove guest {index + 1}</Button> : null}</fieldset>;
    })}<Button type="button" variant="outline" disabled={people.length >= partner.seatLimit} onClick={() => change({ people: JSON.stringify([...people, blankPerson()]) })}>Add another guest</Button></> : <div className="space-y-3">{(["arrivalTime", "serviceTime", "departureTime", "notes"] as const).map(key => <label className="block space-y-1 text-sm" key={key}>{{ arrivalTime: "When will you arrive?", serviceTime: "When will you start?", departureTime: "When will you leave?", notes: "Notes for the organizer" }[key]}<Input type={key === "notes" ? "text" : "time"} maxLength={key === "notes" ? 2000 : 5} value={currentSchedule[key]} onChange={e => change({ schedule: JSON.stringify({ ...currentSchedule, [key]: e.target.value }) })} /></label>)}</div>}
    {message ? <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">{message}</p> : null}
    <Button type="submit" disabled={busy || !!state.remote}>{busy ? "Saving…" : partner.role === "sponsor" ? "Confirm guest list" : "Save my times"}</Button><p className="text-xs text-muted-foreground">This link is just for you. Please do not forward it.</p>
  </fieldset></form>;
}
