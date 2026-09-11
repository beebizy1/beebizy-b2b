/**
 * Team and Enterprise are sold, not self-served, so this is where those plans end.
 *
 * It posts to the public `/api/lead` endpoint that already existed and had no caller:
 * the pricing page used a `mailto:` link, which opens nothing on a machine with no mail
 * client configured and loses the enquiry silently. A form that reports its own failure
 * is the difference between a lead and a lost one.
 */

import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { BrandLogoLink } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_NAMES, type PlanId } from "@/data/plans";

const SALES_PLAN_IDS = ["team", "enterprise"] as const satisfies readonly PlanId[];

export default function ContactSalesPage() {
  const requested = new URLSearchParams(window.location.search).get("plan");
  const planId = SALES_PLAN_IDS.find((candidate) => candidate === requested) ?? SALES_PLAN_IDS[0];
  const plan = PLAN_NAMES[planId];

  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(formEvent.currentTarget);
    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          company: form.get("company"),
          phone: form.get("phone"),
          plan,
          notes: form.get("notes"),
          // Honeypot the endpoint already checks. Real people leave it empty.
          website: form.get("website"),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "We couldn't send that. Please try again.");
      }
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't send that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <BrandLogoLink />
          <Button asChild variant="ghost" size="sm"><Link href="/pricing">Back to pricing</Link></Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-text">Contact sales</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight">Let's size {plan} for your events</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Tell us how you run events and we'll come back with pricing and a walkthrough. Team and Enterprise are
            invoiced after approval, so nothing is charged here.
          </p>

          {sent ? (
            <div className="mt-8 rounded-2xl border border-success/30 bg-success-tint p-6">
              <p className="flex items-center gap-2 font-bold text-success-text">
                <Check className="size-5" aria-hidden="true" />Thanks. That's with our team.
              </p>
              <p className="mt-2 text-sm text-success-text">
                We reply to every request within one business day. You can keep exploring in the meantime.
              </p>
              <Button asChild className="mt-5" size="sm"><Link href="/pricing">Back to pricing</Link></Button>
            </div>
          ) : (
            <form className="mt-8 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
              <label className="hidden" aria-hidden="true">
                Leave this empty<input name="website" tabIndex={-1} autoComplete="off" />
              </label>

              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Your name</Label>
                <Input id="contact-name" name="name" required maxLength={200} autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">Work email</Label>
                <Input id="contact-email" name="email" type="email" required maxLength={200} autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-company">Company</Label>
                <Input id="contact-company" name="company" required maxLength={200} autoComplete="organization" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-phone">Phone (optional)</Label>
                <Input id="contact-phone" name="phone" maxLength={200} autoComplete="tel" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="contact-notes">What are you planning?</Label>
                <Textarea
                  id="contact-notes"
                  name="notes"
                  rows={4}
                  maxLength={1000}
                  placeholder="How many events a year, team size, anything you need it to do."
                />
              </div>

              {error ? (
                <p className="sm:col-span-2 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger-text">
                  {error}
                </p>
              ) : null}

              <div className="sm:col-span-2">
                <Button type="submit" size="lg" disabled={busy}>
                  {busy ? "Sending…" : "Request pricing"}
                  {!busy ? <ArrowRight aria-hidden="true" /> : null}
                </Button>
              </div>
            </form>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-card-border bg-card p-6">
          <h2 className="font-bold">{plan}</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {[
              "Unlimited events and team members",
              "Vendor management",
              "Weather and contingency planning",
              ...(planId === "enterprise" ? ["Multi-location calendars and custom reporting"] : []),
              "Onboarding and migration from your current tools",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />{line}
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Invoiced after approval. No card is collected on this page.
          </p>
        </aside>
      </main>
    </div>
  );
}
