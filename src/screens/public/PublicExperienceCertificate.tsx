import { Award, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingRows, Panel } from "@/components/primitives";
import { usePublicExperienceCertificate } from "@/data/hooks";

export default function PublicExperienceCertificatePage({ token }: { token: string }) {
  const { data, isLoading } = usePublicExperienceCertificate(token);
  if (isLoading) return <main className="mx-auto max-w-3xl p-8"><LoadingRows rows={4} /></main>;
  if (!data) return <main className="mx-auto max-w-3xl p-8"><Panel><EmptyState icon={Award} title="This certificate is not available" description="Ask the event organizer for the current certificate link." /></Panel></main>;
  return (
    <main className="min-h-screen bg-surface-sunken p-5 text-foreground print:bg-background print:p-0">
      <article className="mx-auto flex min-h-[44rem] max-w-3xl flex-col justify-between rounded-3xl border-4 border-primary bg-background p-8 text-center shadow-sm print:min-h-[9in] print:border-4 print:shadow-none sm:p-14">
        <header><p className="text-sm font-black uppercase tracking-[0.22em] text-primary">{data.organizationName}</p><Award className="mx-auto mt-7 size-16 text-primary" /><p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Auction experience certificate</p></header>
        <section><p className="text-lg text-muted-foreground">Presented to</p><h1 className="mt-2 text-4xl font-black sm:text-5xl">{data.winnerName}</h1><p className="mt-8 text-lg text-muted-foreground">for</p><h2 className="mt-2 text-3xl font-bold sm:text-4xl">{data.itemTitle}</h2><p className="mt-4 text-base text-muted-foreground">Won at {data.eventTitle}</p></section>
        <section className="space-y-3 rounded-2xl bg-primary-muted p-5 text-left text-sm leading-6"><p><strong>Redemption details:</strong> {data.deliveryDetails || "Contact the event organizer to arrange redemption."}</p>{data.restrictions ? <p><strong>Restrictions:</strong> {data.restrictions}</p> : null}{data.expiresAt ? <p><strong>Expires:</strong> {new Date(data.expiresAt).toLocaleDateString(undefined, { dateStyle: "long", timeZone: "UTC" })}</p> : null}</section>
        <footer><p className="text-xs text-muted-foreground">Issued by {data.organizationName} · Powered by Beebizy</p><Button variant="outline" className="mt-5 print:hidden" onClick={() => window.print()}><Printer className="mr-1.5 size-4" />Print or save PDF</Button></footer>
      </article>
    </main>
  );
}
