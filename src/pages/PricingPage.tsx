import { useState } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { BrandLogoLink } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useData } from "@/data/provider";
import { useSession } from "@/app/session";
import { SOLO_FEATURES, SOLO_LIMITS, SOLO_PRICE_OPTIONS, type BillingInterval } from "@/data/plans";
import { cn } from "@/lib/utils";

type PlanCard = {
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

const plans = (interval: BillingInterval): PlanCard[] => [
  {
    name: "Solo",
    audience: "For independent planners running focused events",
    price: SOLO_PRICE_OPTIONS[interval].display,
    cadence: interval === "month" ? "per month" : "per year",
    facts: [
      `${SOLO_LIMITS.eventsPerYear} events per year`,
      `${SOLO_LIMITS.teamMembers} total team members`,
      "0% Beebizy registration fee",
    ],
    featuresTitle: "Five core features included",
    features: [...SOLO_FEATURES],
    note: "Zero Beebizy registration fees. Standard Stripe or card-processing fees may still apply to ticket payments.",
    cta: "Choose Solo",
    selfServe: true,
  },
  {
    name: "Team (Hive)",
    audience: "For lean event teams that plan together",
    price: "Contact sales",
    cadence: "",
    features: [
      "Everything in Solo",
      "Unlimited events and team members",
      "Vendor management",
      "Inspiration boards and contingency planning",
    ],
    cta: "Contact sales",
    featured: true,
  },
  {
    name: "Enterprise (Colony)",
    audience: "For distributed organizations and hospitality groups",
    price: "Contact sales",
    cadence: "",
    features: [
      "Everything in Team",
      "Multi-location calendars",
      "Custom integrations",
      "Dedicated support and reporting",
    ],
    cta: "Contact sales",
  },
];

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status } = useSession();
  const data = useData();
  const query = new URLSearchParams(window.location.search);
  const yearlySavings = SOLO_PRICE_OPTIONS.month.amountCents * 12 - SOLO_PRICE_OPTIONS.year.amountCents;

  const chooseSolo = async () => {
    if (status !== "authenticated") {
      window.location.assign("/login?returnTo=%2Fpricing");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { url } = await data.billing.checkout(interval);
      window.location.assign(url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be opened.");
      setLoading(false);
    }
  };

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
            Solo gives independent planners five essential tools, predictable limits, and no Beebizy registration fees.
          </p>
        </div>

        <div className="mx-auto mt-10 flex w-fit rounded-xl border border-card-border bg-surface-sunken p-1" role="group" aria-label="Billing interval">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              aria-pressed={interval === value}
              className={cn(
                "rounded-lg px-5 py-2 text-sm font-semibold transition-colors",
                interval === value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "month" ? "Monthly" : "Yearly"}
              {value === "year" ? (
                <span className="ml-2 text-xs text-success-text">Save ${yearlySavings / 100}</span>
              ) : null}
            </button>
          ))}
        </div>

        {query.get("checkout") === "cancelled" ? (
          <p className="mx-auto mt-5 max-w-xl rounded-lg border border-hairline bg-surface px-4 py-3 text-center text-sm text-muted-foreground">
            Checkout was cancelled. No payment was taken.
          </p>
        ) : null}
        {query.get("demo") === "true" ? (
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
          {plans(interval).map((plan) => (
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
              <div className="mt-8 flex items-end gap-2">
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
                <Button className="mt-7 w-full" size="lg" onClick={() => void chooseSolo()} disabled={loading}>
                  {loading ? "Opening secure checkout…" : plan.cta}
                  {!loading ? <ArrowRight aria-hidden="true" /> : null}
                </Button>
              ) : (
                <Button asChild className="mt-7 w-full" size="lg" variant={plan.featured ? "default" : "outline"}>
                  <Link href={`/contact-sales?plan=${encodeURIComponent(plan.name)}`}>
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
          Solo checkout is securely processed by Stripe. Team and Enterprise are invoiced after approval.
        </div>
      </main>
    </div>
  );
}
