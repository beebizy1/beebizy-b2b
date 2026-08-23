/** The founder story, kept public so the product has a human point of view. */

import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { BrandLogoLink } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-primary-wash text-foreground">
      <header className="border-b border-primary/25 bg-primary-wash/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
          <BrandLogoLink to="/app" size="lg" />
          <nav className="flex items-center gap-2" aria-label="About navigation">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/app">Open Beebizy</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-14 px-6 py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(26rem,0.95fr)] lg:items-center lg:px-10 lg:py-24">
          <div>
            <p className="eyebrow text-primary-text">Our story</p>
            <h1 className="mt-7 max-w-3xl text-5xl font-extrabold leading-[0.98] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-7xl">
              Built by an event planner,
              <br />
              for event planners.
            </h1>

            <div className="mt-10 max-w-2xl space-y-6 text-lg leading-8 text-muted-foreground">
              <p>
                <strong className="font-bold text-foreground">Laila Marshall</strong> spent over a decade in the field,
                coordinating more than <strong className="font-bold text-foreground">500 events</strong> across corporate
                conferences, galas, product launches, and everything in between.
              </p>
              <p>
                After years of juggling spreadsheets, endless email threads, and tools built without the realities of
                event day in mind, she had a simple thought: <em className="font-semibold text-foreground">There has to be a better way.</em>
              </p>
              <p>
                Beebizy is that tool. It is not a generic project manager with an events label. It is designed around
                how event teams actually operate, from the first venue decision to the post-event wrap-up.
              </p>
              <p>
                Today, Beebizy helps teams at Fortune 500 companies, nonprofits, and everything in between bring their
                events to life without losing their minds in the process.
              </p>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <img
                src="/laila-marshall.png"
                alt=""
                className="size-14 rounded-full border-2 border-primary object-cover object-top shadow-sm"
              />
              <div>
                <p className="font-bold text-foreground">Laila Marshall</p>
                <p className="text-sm text-muted-foreground">Founder &amp; CEO, Beebizy</p>
              </div>
            </div>
          </div>

          <aside className="relative mx-auto w-full max-w-xl" aria-label="Laila Marshall's event planning experience">
            <img
              src="/laila-marshall.png"
              alt="Laila Marshall, founder and CEO of Beebizy"
              className="aspect-[620/645] w-full rounded-[2rem] object-cover object-top shadow-2xl"
            />
            <div className="absolute -bottom-5 left-4 right-4 rounded-2xl border border-primary/30 bg-background/95 px-6 py-4 shadow-xl backdrop-blur sm:-left-5 sm:right-[-1.5rem]">
              <p className="font-bold text-foreground">Laila Marshall</p>
              <p className="text-sm text-muted-foreground">Founder &amp; CEO, Beebizy · 500+ events planned</p>
            </div>
          </aside>
        </section>

        <section className="border-t border-primary/25 bg-background">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between lg:px-10">
            <div>
              <p className="eyebrow text-primary-text">Built for the work</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Plan the event, not the software.</h2>
            </div>
            <Button asChild size="lg">
              <Link href="/app">
                Open Beebizy
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
