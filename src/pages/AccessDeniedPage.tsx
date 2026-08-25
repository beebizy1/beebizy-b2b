import { Link } from "wouter";
import { LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/app/session";

export default function AccessDeniedPage() {
  const { signOut } = useSession();

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <Link href="/" aria-label="Beebizy home">
          <BrandLogo size="lg" />
        </Link>

        <section className="w-full rounded-2xl border border-card-border bg-card p-8 shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/15 text-foreground">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </div>
          <h1 className="headline mt-5 text-foreground">Beebizy Studio is private</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            New account creation is closed. Studio access is currently limited to approved internal operators.
            If your team is interested in Beebizy, our sales team can help.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/?sales=1">Talk to sales</Link>
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
