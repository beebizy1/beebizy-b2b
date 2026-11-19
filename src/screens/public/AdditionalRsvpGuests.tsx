import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registrationQuestionsFor, type RegistrationQuestion } from "@/data/registrationPage";
import type { PublicRsvpGuestDraft } from "@/data/publicRegistrationIdentity";

export function RsvpQuestions({ questions, answers, onChange, prefix = "", audience = "primary" }: { questions: RegistrationQuestion[]; answers: Record<string, string>; onChange(value: Record<string, string>): void; prefix?: string; audience?: "primary" | "guests" }) {
  return <>{registrationQuestionsFor(questions, audience).map(question => <label key={question.id} className="block space-y-1 text-sm font-medium">{question.label}<span className="ml-1 font-normal text-muted-foreground">{question.required ? "(required)" : "(optional)"}</span>{question.type === "select"
    ? <select aria-label={`${prefix}${question.label}`} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={answers[question.id] ?? ""} required={question.required} onChange={event => onChange({ ...answers, [question.id]: event.target.value })}><option value="">Choose an option</option>{question.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
    : <Input aria-label={`${prefix}${question.label}`} value={answers[question.id] ?? ""} required={question.required} maxLength={1000} onChange={event => onChange({ ...answers, [question.id]: event.target.value })} />}</label>)}</>;
}

export default function AdditionalRsvpGuests({ guests, maximum, questions, onChange }: { guests: PublicRsvpGuestDraft[]; maximum: number; questions: RegistrationQuestion[]; onChange(value: PublicRsvpGuestDraft[]): void }) {
  function patch(id: string, value: Partial<PublicRsvpGuestDraft>) { onChange(guests.map(guest => guest.id === id ? { ...guest, ...value } : guest)); }
  const guestQuestions = registrationQuestionsFor(questions, "guests");
  return <section className="space-y-4 border-t border-hairline pt-5" aria-label="Additional guests">
    <div><h2 className="font-semibold">Bringing a guest?</h2><p className="mt-1 text-sm text-muted-foreground">{maximum ? `You can add ${maximum === 1 ? "one guest" : `up to ${maximum} guests`}. Each person gets their own place on the guest list.` : "The organizer has turned off additional guests. Remove the saved guests below to continue."}</p></div>
    {guests.length > maximum && maximum > 0 ? <p role="alert" className="text-sm text-danger-text">The organizer now allows {maximum} additional guest{maximum === 1 ? "" : "s"}. Remove an extra guest to continue.</p> : null}
    {guests.map((guest, index) => <fieldset key={guest.id} className="space-y-4 rounded-xl border border-hairline bg-primary-muted/20 p-4">
      <legend className="px-1 text-sm font-semibold">Guest {index + 1}</legend>
      <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" aria-label={`Remove guest ${index + 1}`} onClick={() => onChange(guests.filter(item => item.id !== guest.id))}><Trash2 className="size-3.5" />Remove</Button></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm font-medium">First name<Input aria-label={`Guest ${index + 1} first name`} value={guest.firstName} autoComplete="off" maxLength={120} required onChange={event => patch(guest.id, { firstName: event.target.value })} /></label><label className="block space-y-1 text-sm font-medium">Last name<Input aria-label={`Guest ${index + 1} last name`} value={guest.lastName} autoComplete="off" maxLength={120} required onChange={event => patch(guest.id, { lastName: event.target.value })} /></label></div>
      <label className="block space-y-1 text-sm font-medium">Guest email <span className="font-normal text-muted-foreground">(optional)</span><Input aria-label={`Guest ${index + 1} email`} type="email" autoComplete="off" maxLength={320} value={guest.email} onChange={event => patch(guest.id, { email: event.target.value })} /></label>
      {guestQuestions.length ? <p className="text-xs text-muted-foreground">Answer these questions for this guest.</p> : null}
      <RsvpQuestions questions={guestQuestions} audience="guests" answers={guest.answers} prefix={`Guest ${index + 1}: `} onChange={answers => patch(guest.id, { answers })} />
    </fieldset>)}
    {guests.length < maximum ? <Button type="button" variant="outline" onClick={() => onChange([...guests, { id: crypto.randomUUID(), firstName: "", lastName: "", email: "", answers: {} }])}><Plus className="size-4" />{guests.length ? "Add another guest" : "Add a guest"}</Button> : null}
    {guests.length ? <p className="text-xs text-muted-foreground">We’ll send the confirmation for your group to your email address.</p> : null}
  </section>;
}
