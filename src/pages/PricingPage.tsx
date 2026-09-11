import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { BrandLogoLink } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useData } from "@/data/provider";
import { useMe } from "@/data/hooks";
import { useSession } from "@/app/session";
import {
  PLAN_NAMES,
  SOLO_FEATURES,
  SOLO_LIMITS,
  SOLO_PRICE_OPTIONS,
  SOLO_TRIAL_DAYS,
  TEAM_LIMITS,
  type PlanId,
} from "@/data/plans";
import { cn } from "@/lib/utils";

type PlanCard = {
  id: PlanId;
  name: string;
  audience: string;
  price: string;
  cadence: string;
  facts?: string[];
  featuresTitle?: string;
  features: string[];
  note?: string;
  cta: string;
  featured?: boolean;
  selfServe?: boolean;
};

const plans: PlanCard[] = [
  {
    id: "solo",
    name: PLAN_NAMES.solo,
    audience: "For independent planners running focused events",
    price: SOLO_PRICE_OPTIONS.month.display,
    cadence: "per month",
    facts: [
      `${SOLO_TRIAL_DAYS} days free`,
      `${SOLO_LIMITS.eventsPerYear} events per year`,
      `${SOLO_LIMITS.teamMembers} total team members`,
    ],
    featuresTitle: "Five core features included",
    features: [...SOLO_FEATURES],
    note: `Card required. $0 today, then ${SOLO_PRICE_OPTIONS.month.display}/month after ${SOLO_TRIAL_DAYS} days unless cancelled. Zero Beebizy registration fees. Standard card-processing fees may still apply to ticket payments.`,
    cta: `Start ${SOLO_TRIAL_DAYS}-day free trial`,
    selfServe: true,
  },
  /*
   * The paid tiers carry the same furniture as Solo - a facts strip, a titled list of the
   * same length, a closing note - because they did not, and it showed. Solo spelled out
   * five capabilities while Team and Enterprise offered three short lines above a third
   * of a card of white space, so the cheapest plan read as the most complete one.
   *
   * Every line below is a capability the API actually gates, not a phrase: vendors,
   * vendor messages and contingency are Team and above; locations, reporting and event
   * analytics are Enterprise. See `PLAN_CAPABILITIES`.
   */
  {
    id: "team",
    name: PLAN_NAMES.team,
    audience: "For lean event teams that plan together",
    price: "Contact sales",
    cadence: "",
    facts: ["Unlimited events", `${TEAM_LIMITS.teamMembers} team members`, "Vendor management"],
    featuresTitle: "Everything in Solo, plus",
    features: [
      `Unlimited events and up to ${TEAM_LIMITS.teamMembers} team members`,
      "Vendor directory with bookings and confirmations",
      "Vendor conversations in one shared inbox",
      "Beebizy marketplace vendor suggestions",
      "Weather and contingency planning",
    ],
    note: "Invoiced after approval. No card is collected here, and pricing is agreed with you before anything starts.",
    cta: "Contact sales",
    featured: true,
  },
  {
    id: "enterprise",
    name: PLAN_NAMES.enterprise,
    audience: "For distributed organizations and hospitality groups",
    price: "Contact sales",
    cadence: "",
    facts: ["Unlimited events", "Multi-location", "Dedicated support"],
    featuresTitle: "Everything in Team, plus",
    features: [
      "Multi-location calendars and a shared venue library",
      "Custom reporting across every event",
      "Per-event analytics and return on investment",
      "Custom integrations with your existing tools",
      "Dedicated support and onboarding",
    ],
    note: "Invoiced after approval. No card is collected here, and pricing is agreed with you before anything starts.",
    cta: "Contact sales",
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status } = useSession();
  const data = useData();
  // Only asked once there is a session to ask about; /pricing is a public page.
  const me = useMe({ enabled: status === "authenticated" });
  const accessStatus = me.data?.access?.status;
  /** The two states that already open Studio. Everything else needs a plan first. */
  const hasStudioAccess = accessStatus === "active" || accessStatus === "beta";
  const query = new URLSearchParams(window.location.search);
  const startRequested = query.get("start") === "solo";
  const checkoutCancelled = query.get("checkout") === "cancelled";
  const demoCheckout = query.get("demo") === "true";
  const checkoutStarted = useRef(false);

  const chooseSolo = useCallback(async () => {
    if (status === "loading") return;
    if (status === "demo") {
      window.location.assign("/pricing?demo=true");
      return;
    }
    if (status !== "authenticated") {
      const returnTo = "/pricing?start=solo";
      window.location.assign(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    /*
     * Someone who can already open Studio is not a trial customer.
     *
     * Signing in used to land them back here: Checkout refuses a workspace that is
     * already active, so the error was caught and the page simply stayed put, which
     * reads as a login that did nothing. A workspace still inside its beta had the
     * opposite problem - Checkout opened and offered to charge for access it already
     * has. Both go to Studio, which is what they were trying to reach.
     */
    if (hasStudioAccess) {
      window.location.assign("/app");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { url } = await data.billing.checkout("month");
      window.location.assign(url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be opened.");
      setLoading(false);
    }
    // hasStudioAccess is a dependency: it starts false and flips once /me resolves, and a
    // callback holding the first value would send an existing customer to Checkout.
  }, [data.billing, hasStudioAccess, status]);

  useEffect(() => {
    if (!startRequested || status !== "authenticated" || checkoutStarted.current) return;
    // Wait for the workspace's access before deciding, or an existing customer is sent
    // to Checkout in the moment before we know they never needed it.
    if (me.isLoading) return;
    checkoutStarted.current = true;
    void chooseSolo();
  }, [chooseSolo, me.isLoading, startRequested, status]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-hairline bg-surface/95">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <BrandLogoLink to="/marketing-preview" size="md" />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/marketing-preview">About Beebizy</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={status === "authenticated" ? "/app" : "/login"}>
                {status === "authenticated" ? "Open Studio" : "Sign in"}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary-text">Simple, flexible pricing</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-6xl">A plan for every kind of event team</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Start Solo free for {SOLO_TRIAL_DAYS} days with a card. Pay nothing today, then {SOLO_PRICE_OPTIONS.month.display}/month unless you cancel.
          </p>
        </div>

        {checkoutCancelled ? (
          <p className="mx-auto mt-5 max-w-xl rounded-lg border border-hairline bg-surface px-4 py-3 text-center text-sm text-muted-foreground">
            Checkout was cancelled. Your trial did not start and no payment was taken.
          </p>
        ) : null}
        {demoCheckout ? (
          <p className="mx-auto mt-5 max-w-xl rounded-lg border border-hairline bg-surface px-4 py-3 text-center text-sm text-muted-foreground">
            Checkout is disabled in the local demo. Sign in on the private Beebizy preview to test it.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mx-auto mt-5 max-w-xl rounded-lg border border-danger/25 bg-danger-tint px-4 py-3 text-center text-sm text-danger-text">
            {error}
          </p>
        ) : null}

        <section className="mt-10 grid items-stretch gap-5 lg:grid-cols-3" aria-label="Beebizy plans">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={cn(
                "relative flex min-h-[510px] flex-col rounded-2xl border bg-card p-7 shadow-sm",
                plan.featured ? "border-primary shadow-[0_16px_45px_rgba(180,140,0,0.12)]" : "border-card-border",
              )}
            >
              {plan.featured ? (
                <span className="absolute right-5 top-5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                  Built for teams
                </span>
              ) : null}
              <div className="pr-20">
                <h2 className="text-2xl font-bold">{plan.name}</h2>
                <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted-foreground">{plan.audience}</p>
              </div>
              {/* Fixed height: the Solo figure is set larger than "Contact sales", and
                  without it every row below - facts, button, feature list - sat a dozen
                  pixels lower on one card than the other two. */}
              <div className="mt-8 flex min-h-14 items-end gap-2">
                <span
                  className={cn("font-extrabold tracking-tight", plan.selfServe ? "text-5xl" : "text-3xl")}
                  data-numeric={plan.selfServe ? true : undefined}
                >
                  {plan.price}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">{plan.cadence}</span>
              </div>

              {plan.facts ? (
                <div className="mt-6 grid grid-cols-3 divide-x divide-primary/20 rounded-xl border border-primary/20 bg-primary/8 py-3">
                  {plan.facts.map((fact) => (
                    <p key={fact} className="px-2 text-center text-xs font-semibold leading-snug text-foreground">
                      {fact}
                    </p>
                  ))}
                </div>
              ) : null}

              {plan.selfServe ? (
                <Button className="mt-7 w-full" size="lg" onClick={() => void chooseSolo()} disabled={loading || status === "loading"}>
                  {loading ? "Opening secure checkout…" : hasStudioAccess ? "Open Studio" : plan.cta}
                  {!loading ? <ArrowRight aria-hidden="true" /> : null}
                </Button>
              ) : (
                <Button asChild className="mt-7 w-full" size="lg" variant={plan.featured ? "default" : "outline"}>
                  <Link href={`/contact-sales?plan=${plan.id}`}>
                    {plan.cta}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              )}

              <div className="my-7 h-px bg-hairline" />
              {plan.featuresTitle ? <p className="mb-4 text-sm font-bold">{plan.featuresTitle}</p> : null}
              <ul className="space-y-4 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-muted text-primary-text">
                      <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                    </span>
                    <span className="leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>
              {plan.note ? <p className="mt-auto pt-7 text-xs leading-relaxed text-muted-foreground">{plan.note}</p> : null}
            </article>
          ))}
        </section>

        <div className="mt-10 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-success-text" aria-hidden="true" />
          Stripe securely stores your card. Solo is free for {SOLO_TRIAL_DAYS} days, then renews monthly. Team and Enterprise are invoiced after approval.
        </div>
      </main>
    </div>
  );
}
