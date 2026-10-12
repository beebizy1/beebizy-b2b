import { useState } from "react";
import { CheckCircle2, CreditCard, ReceiptText } from "lucide-react";
import { PublicFrame } from "./PublicEvent";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import { usePayPublicBidderBill, usePublicBidderBill } from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";

export default function PublicBidderBillPage({ token }: { token: string }) {
  const { data: bill, isLoading } = usePublicBidderBill(token);
  const pay = usePayPublicBidderBill();
  const [coverFees, setCoverFees] = useState(false);
  if (isLoading) return <PublicFrame><LoadingRows rows={4} /></PublicFrame>;
  if (!bill) return <PublicFrame><Panel><EmptyState icon={ReceiptText} title="This bill is not available" description="Ask the event organizer for the current payment link." /></Panel></PublicFrame>;
  if (bill.status === "paid") return <PublicFrame><Panel className="p-8 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h1 className="mt-4 text-2xl font-bold">Payment complete</h1><p className="mt-2 text-sm text-muted-foreground">Your combined payment for {bill.eventTitle} is confirmed.</p>{bill.receiptToken ? <Button asChild className="mt-5"><a href={`/receipt/${bill.receiptToken}`}>View tax receipt</a></Button> : <p className="mt-4 text-xs text-muted-foreground">Your receipt is being prepared.</p>}</Panel></PublicFrame>;
  if (bill.status === "refunded" || bill.status === "refunding") return <PublicFrame><Panel className="p-8 text-center"><ReceiptText className="mx-auto size-12 text-muted-foreground" /><h1 className="mt-4 text-2xl font-bold">{bill.status === "refunded" ? "Payment refunded" : "Refund processing"}</h1><p className="mt-2 text-sm text-muted-foreground">This combined bill for {bill.eventTitle} cannot be paid again. A corrected receipt is sent automatically after the refund completes.</p></Panel></PublicFrame>;
  return (
    <PublicFrame>
      <div className="space-y-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Combined event bill</p><h1 className="mt-2 text-3xl font-bold">Review and pay</h1><p className="mt-2 text-sm text-muted-foreground">{bill.bidderName} · {bill.eventTitle}</p></div>
        <Panel>
          <PanelHeader title="Auction items and gifts" actions={<Pill>{bill.status}</Pill>} />
          <div className="divide-y divide-hairline">{bill.lineItems.map((item, index) => <div key={`${item.description}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-4"><div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">Value received {formatMoney(item.fairMarketValueCents)} · Estimated deductible {formatMoney(item.deductibleCents)}</p></div><p className="font-semibold">{formatMoney(item.amountCents)}</p></div>)}</div>
          <div className="space-y-3 border-t border-hairline p-5">
            <div className="flex justify-between text-sm"><span>Items</span><span>{formatMoney(bill.itemsTotalCents)}</span></div>
            <div className="flex justify-between text-sm"><span>Fund-a-Need and gifts</span><span>{formatMoney(bill.pledgesTotalCents)}</span></div>
            <label className="flex items-start gap-2 rounded-lg bg-surface-sunken p-3 text-sm"><input type="checkbox" checked={coverFees} onChange={(event) => setCoverFees(event.target.checked)} className="mt-1" /><span><strong>Cover processing and platform fees</strong><br /><span className="text-xs text-muted-foreground">The exact covered amount is calculated securely at checkout and is included in your gift.</span></span></label>
            <div className="flex items-center justify-between border-t border-hairline pt-3"><span className="font-semibold">Current total</span><span className="text-xl font-bold">{formatMoney(bill.totalCents)}</span></div>
            <Button size="lg" className="w-full" disabled={pay.isPending} onClick={() => pay.mutate({ token, coverFees }, { onSuccess: (result) => window.location.assign(result.url), onError: (error) => toast({ title: "Couldn't open payment", description: error.message }) })}><CreditCard className="mr-2 size-5" />{pay.isPending ? "Opening secure payment..." : "Pay securely"}</Button>
            <p className="text-center text-xs text-muted-foreground">Apple Pay and Google Pay appear when supported by your device and Stripe account.</p>
          </div>
        </Panel>
      </div>
    </PublicFrame>
  );
}
