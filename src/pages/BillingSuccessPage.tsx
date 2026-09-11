import { CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { BrandLogoLink } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/app/session";
import { SOLO_TRIAL_DAYS } from "@/data/plans";

export default function BillingSuccessPage() {
  const { status } = useSession();

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-5 py-12">
      <div className="w-full max-w-lg space-y-7 text-center">
        <BrandLogoLink to="/marketing-preview" size="lg" />
        <div className="rounded-2xl border border-card-border bg-card p-8 shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-tint text-success-text">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight">Your {SOLO_TRIAL_DAYS}-day Solo trial is being activated</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Stripe securely saved your card, and you were not charged today. Beebizy will unlock the workspace as soon as the verified subscription update arrives.
          </p>
          <Button asChild className="mt-7 w-full" size="lg">
            <Link href={status === "authenticated" ? "/app" : "/login"}>
              {status === "authenticated" ? "Open Beebizy Studio" : "Sign in to Beebizy"}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
