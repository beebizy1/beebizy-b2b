import { Link } from "wouter";
import { Clock3 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/app/session";

export default function SubscriptionRequiredPage() {
  const { signOut, trialEndsAt } = useSession();
  const trialEnd = trialEndsAt
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(
        new Date(trialEndsAt),
      )
    : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <Link href="/" aria-label="Beebizy home">
          <BrandLogo size="lg" />
        </Link>

        <section className="w-full rounded-2xl border border-card-border bg-card p-8 shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/15 text-foreground">
            <Clock3 aria-hidden="true" className="size-5" />
          </div>
          <h1 className="headline mt-5 text-foreground">Your private beta has ended</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your complimentary 3-month Beebizy Studio beta{trialEnd ? ` ended on ${trialEnd}` : " has ended"}. Choose
            a paid subscription to keep your events, vendors, plans and reports available.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/?sales=1">Choose a paid plan</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
