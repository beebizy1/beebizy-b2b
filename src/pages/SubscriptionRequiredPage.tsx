import { Link } from "wouter";
import { Clock3 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/app/session";

export default function SubscriptionRequiredPage() {
  const { signOut } = useSession();

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
            Your complimentary three-month Beebizy Studio beta has ended. Your workspace is preserved while you
            contact Beebizy to activate paid access.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <a href="mailto:hello@beebizy.com?subject=Activate%20Beebizy%20Studio">Activate Studio</a>
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
