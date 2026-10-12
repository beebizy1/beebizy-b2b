import { Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingRows, Panel, Pill } from "@/components/primitives";
import { usePublicFundraisingReceipt } from "@/data/hooks";
import { formatMoney } from "@/data/money";

export default function PublicFundraisingReceiptPage({ token }: { token: string }) {
  const { data, isLoading } = usePublicFundraisingReceipt(token);
  if (isLoading) return <div className="mx-auto max-w-3xl p-8"><LoadingRows rows={5} /></div>;
  if (!data) return <div className="mx-auto max-w-3xl p-8"><Panel><EmptyState icon={ReceiptText} title="This receipt is not available" description="Ask the organization for a corrected receipt link." /></Panel></div>;
  const { receipt, organization } = data;
  const corrected = Boolean(receipt.supersedesReceiptId);
  return (
    <main className="min-h-screen bg-white p-5 text-black print:p-0">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6">
          <div><p className="text-sm font-bold uppercase tracking-[0.15em]">{organization.legalName}</p><p className="mt-1 text-sm text-gray-600">EIN {organization.ein}</p><p className="text-sm text-gray-600">{organization.orgType === "government" ? "Government or public school entity" : "501(c)(3) nonprofit organization"}</p></div>
          <div className="text-right"><div className="flex justify-end gap-2">{corrected ? <Pill tone="warning">Corrected</Pill> : null}<Pill>{receipt.type.replaceAll("_", " ")}</Pill></div><p className="mt-2 font-mono text-sm">{receipt.receiptNumber}</p></div>
        </header>
        <section className="grid gap-4 border-b border-gray-200 py-6 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-wide text-gray-500">Donor</p><p className="font-semibold">{receipt.payerName}</p>{receipt.payerEmail ? <p className="text-sm text-gray-600">{receipt.payerEmail}</p> : null}</div><div><p className="text-xs uppercase tracking-wide text-gray-500">Event and date</p><p className="font-semibold">{data.eventTitle ?? "Fundraising contribution"}</p><p className="text-sm text-gray-600">{new Date(receipt.issuedAt).toLocaleDateString(undefined, { dateStyle: "long" })}</p></div></section>
        <table className="my-6 w-full text-left text-sm"><thead><tr className="border-b border-gray-300"><th className="py-2">Description</th><th className="py-2 text-right">Paid</th><th className="py-2 text-right">Value received</th><th className="py-2 text-right">Tax-deductible</th></tr></thead><tbody>{receipt.lineItems.map((item, index) => <tr key={`${item.description}-${index}`} className="border-b border-gray-100"><td className="py-3">{item.description}{item.kind === "raffle" ? <span className="block text-xs font-semibold text-red-700">Not tax-deductible</span> : null}</td><td className="py-3 text-right">{formatMoney(item.amountCents)}</td><td className="py-3 text-right">{formatMoney(item.fairMarketValueCents)}</td><td className="py-3 text-right">{formatMoney(item.deductibleCents)}</td></tr>)}</tbody><tfoot><tr className="font-bold"><td className="pt-4">Totals</td><td className="pt-4 text-right">{formatMoney(receipt.amountCents)}</td><td className="pt-4 text-right">{formatMoney(receipt.fairMarketValueCents)}</td><td className="pt-4 text-right">{formatMoney(receipt.deductibleCents)}</td></tr></tfoot></table>
        <section className="rounded-xl bg-gray-50 p-4 text-sm leading-6"><p className="font-semibold">Goods and services disclosure</p><p>{receipt.fairMarketValueCents > 0 ? `The estimated fair market value of goods and services provided was ${formatMoney(receipt.fairMarketValueCents)}. The deductible amount is limited to the excess of the payment over that value.` : "No goods or services were provided in exchange for this contribution."}</p></section>
        <footer className="mt-6 flex flex-wrap items-end justify-between gap-4 text-xs text-gray-500"><div><p>Keep this receipt for your tax records.</p><p>Issued by {organization.legalName} · Processed by Beebizy.</p></div><Button variant="outline" onClick={() => window.print()} className="print:hidden"><Printer className="mr-1.5 size-4" />Print or save PDF</Button></footer>
      </article>
    </main>
  );
}
