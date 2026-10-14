/** Vendor payment plans and the individual deposits paid against them. */

import { useMemo, useState } from "react";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill, StatTile } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/app/preferences";
import { centsFromInput, centsToInput, formatMoney, sumCents } from "@/data/money";
import { balanceDueState, depositPaidCents, remainingBalanceCents, vendorPaymentPlanDeposits, vendorPaymentProgress } from "@/data/depositTracker";
import {
  useAddDeposit,
  useAddVendorPaymentPlan,
  useBudget,
  useDeposits,
  useEventVendors,
  useRemoveDeposit,
  useUpdateDeposit,
  useUpdateVendorPaymentPlan,
  useVendorPaymentPlans,
} from "@/data/hooks";
import {
  DEPOSIT_STATUSES,
  type Deposit,
  type DepositPatch,
  type DepositStatus,
  type Event,
  type VendorPaymentPlan,
} from "@/data/entities";
import { civilDayInZone } from "@/lib/datetime";

const TONE: Record<DepositStatus, string> = {
  pending: "text-muted-foreground",
  paid: "text-success-text",
  overdue: "text-danger-text font-semibold",
  refunded: "text-info-text",
};

const vendorKey = (name: string) => name.trim().toLocaleLowerCase();
const dateIso = (value: string) => (value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null);
const planKey = (id: string) => `plan:${id}`;
const paymentKey = (payment: Deposit) => payment.paymentPlanId ? planKey(payment.paymentPlanId) : `vendor:${vendorKey(payment.vendorName)}`;
const todayIsoInZone = (timeZone: string) => {
  const today = civilDayInZone(new Date(), timeZone);
  return dateIso(`${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`)!;
};

function DepositRow({ eventId, deposit, vendorName, timeZone }: { eventId: string; deposit: Deposit; vendorName: string; timeZone: string }) {
  const update = useUpdateDeposit();
  const remove = useRemoveDeposit();
  const [amount, setAmount] = useState(centsToInput(deposit.amountCents));
  const [dueDate, setDueDate] = useState(deposit.dueDate?.slice(0, 10) ?? "");
  const [paidDate, setPaidDate] = useState(deposit.paidDate?.slice(0, 10) ?? "");
  const [paidBy, setPaidBy] = useState(deposit.paidBy ?? "");
  const [paymentMethod, setPaymentMethod] = useState(deposit.paymentMethod ?? "");

  const save = (patch: DepositPatch, rollback: () => void) => {
    update.mutate(
      { eventId, id: deposit.id, patch },
      {
        onError: (error) => {
          rollback();
          toast({ title: "Couldn't update payment", description: error.message });
        },
      },
    );
  };

  return (
    <TableRow>
      <TableCell className="min-w-48 font-medium text-foreground">{vendorName}</TableCell>
      <TableCell className="min-w-32">
        <Input
          value={amount}
          onChange={(inputEvent) => setAmount(inputEvent.target.value)}
          onBlur={() => {
            const cents = centsFromInput(amount);
            if (cents == null) return setAmount(centsToInput(deposit.amountCents));
            if (cents !== deposit.amountCents) save({ amountCents: cents }, () => setAmount(centsToInput(deposit.amountCents)));
          }}
          inputMode="decimal"
          aria-label={`Deposit amount for ${deposit.vendorName}`}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell className="min-w-40">
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onBlur={() => save({ dueDate: dateIso(dueDate) }, () => setDueDate(deposit.dueDate?.slice(0, 10) ?? ""))} aria-label={`Deposit due date for ${deposit.vendorName}`} className="h-8" />
      </TableCell>
      <TableCell className="min-w-40">
        <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} onBlur={() => save({ paidDate: dateIso(paidDate) }, () => setPaidDate(deposit.paidDate?.slice(0, 10) ?? ""))} aria-label={`Paid date for ${deposit.vendorName}`} className="h-8" />
      </TableCell>
      <TableCell className="min-w-40">
        <Input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} onBlur={() => save({ paidBy: paidBy.trim() || null }, () => setPaidBy(deposit.paidBy ?? ""))} placeholder="Team member" aria-label={`Paid by for ${deposit.vendorName}`} className="h-8" />
      </TableCell>
      <TableCell className="min-w-40">
        <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} onBlur={() => save({ paymentMethod: paymentMethod.trim() || null }, () => setPaymentMethod(deposit.paymentMethod ?? ""))} placeholder="ACH, card, check" aria-label={`Payment method for ${deposit.vendorName}`} className="h-8" />
      </TableCell>
      <TableCell>
        <Select
          value={deposit.status}
          onValueChange={(value) => {
            const status = value as DepositStatus;
            const previousPaidDate = paidDate;
            const nextPaidDate = status === "paid" ? (deposit.paidDate ?? todayIsoInZone(timeZone)) : null;
            setPaidDate(nextPaidDate?.slice(0, 10) ?? "");
            save({ status, paidDate: nextPaidDate }, () => setPaidDate(previousPaidDate));
          }}
        >
          <SelectTrigger className={cn("w-[120px] capitalize", TONE[deposit.status])} aria-label={`Status for ${deposit.vendorName}`}><SelectValue /></SelectTrigger>
          <SelectContent>{DEPOSIT_STATUSES.map((option) => <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" aria-label={`Delete deposit for ${deposit.vendorName}`} onClick={() => remove.mutate({ eventId, id: deposit.id }, { onError: (error) => toast({ title: "Couldn't delete payment", description: error.message }) })}>
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function PaymentPlanRow({ eventId, plan, deposits, onSelect }: { eventId: string; plan: VendorPaymentPlan; deposits: Deposit[]; onSelect: (name: string) => void }) {
  const { date: formatDate, timeZone } = usePreferences();
  const update = useUpdateVendorPaymentPlan();
  const [total, setTotal] = useState(centsToInput(plan.totalAmountCents));
  const [balanceDueDate, setBalanceDueDate] = useState(plan.balanceDueDate.slice(0, 10));
  const progress = vendorPaymentProgress(plan.totalAmountCents, deposits);
  const dueState = balanceDueState(plan.balanceDueDate, progress.remainingCents, new Date(), timeZone);

  return (
    <TableRow>
      <TableCell><button type="button" className="text-left font-medium hover:underline" onClick={() => onSelect(plan.vendorName)}>{plan.vendorName}</button><p className="text-xs text-muted-foreground">Payment plan</p></TableCell>
      <TableCell className="min-w-36">
        <Input
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          onBlur={() => {
            const cents = centsFromInput(total);
            if (cents == null || cents < progress.paidCents) {
              setTotal(centsToInput(plan.totalAmountCents));
              toast({ title: "Total cost must cover deposits already paid" });
              return;
            }
            if (cents === plan.totalAmountCents) return;
            update.mutate({ eventId, id: plan.id, patch: { totalAmountCents: cents } }, { onError: (error) => { setTotal(centsToInput(plan.totalAmountCents)); toast({ title: "Couldn't update vendor total", description: error.message }); } });
          }}
          inputMode="decimal"
          aria-label={`Total vendor cost for ${plan.vendorName}`}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell className="min-w-52">
        <p data-numeric className="text-right font-semibold text-success-text">{formatMoney(progress.paidCents)} total</p>
        {progress.paidDeposits.length > 0 ? (
          <div className="mt-1 space-y-0.5">
            {progress.paidDeposits.map((deposit) => (
              <p key={deposit.id} data-numeric className="text-right text-[11px] text-muted-foreground">
                {formatMoney(deposit.amountCents)} · {deposit.paidDate ? `paid ${formatDate(deposit.paidDate, "dayMonthYear")}` : "paid date needed"}
              </p>
            ))}
          </div>
        ) : <p className="mt-1 text-right text-[11px] text-muted-foreground">No deposits paid</p>}
      </TableCell>
      <TableCell data-numeric className="text-right font-semibold">{formatMoney(progress.remainingCents)}</TableCell>
      <TableCell className="min-w-40">
        <Input
          type="date"
          value={balanceDueDate}
          onChange={(e) => setBalanceDueDate(e.target.value)}
          onBlur={() => {
            const next = dateIso(balanceDueDate);
            if (!next) return setBalanceDueDate(plan.balanceDueDate.slice(0, 10));
            if (next === plan.balanceDueDate) return;
            update.mutate({ eventId, id: plan.id, patch: { balanceDueDate: next } }, { onError: (error) => { setBalanceDueDate(plan.balanceDueDate.slice(0, 10)); toast({ title: "Couldn't update balance due date", description: error.message }); } });
          }}
          aria-label={`Remaining balance due date for ${plan.vendorName}`}
          className={cn("h-8", dueState === "overdue" && "border-danger text-danger-text")}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(plan.balanceDueDate, "dayMonthYear")}</p>
      </TableCell>
      <TableCell data-numeric className="min-w-36">
        {progress.completedAt ? <span className="font-medium text-success-text">{formatDate(progress.completedAt, "dayMonthYear")}</span> : progress.remainingCents === 0 ? <span className="text-warning-text">Date needed</span> : <span className="text-muted-foreground">Not completed</span>}
      </TableCell>
      <TableCell><Pill tone={dueState === "overdue" ? "danger" : dueState === "paid" ? "success" : "neutral"}>{dueState}</Pill></TableCell>
    </TableRow>
  );
}

export default function DepositsPanel({ event }: { event: Event }) {
  const { timeZone } = usePreferences();
  const depositsQuery = useDeposits(event.id);
  const plansQuery = useVendorPaymentPlans(event.id);
  const { data: bookings } = useEventVendors(event.id);
  const { data: budget } = useBudget(event.id);
  const addDeposit = useAddDeposit();
  const addPlan = useAddVendorPaymentPlan();
  const updatePlan = useUpdateVendorPaymentPlan();
  const [vendorName, setVendorName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentPaidDate, setPaymentPaidDate] = useState("");
  const [balanceDueDate, setBalanceDueDate] = useState("");
  const [status, setStatus] = useState<DepositStatus>("paid");

  const rows = useMemo(() => depositsQuery.data ?? [], [depositsQuery.data]);
  const storedPlans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const paid = sumCents(rows.map(depositPaidCents));
  const paymentGroups = useMemo(() => {
    const values = new Map<string, Deposit[]>();
    for (const row of rows) values.set(paymentKey(row), [...(values.get(paymentKey(row)) ?? []), row]);
    return values;
  }, [rows]);
  const paymentsForPlan = (plan: VendorPaymentPlan) => vendorPaymentPlanDeposits(plan, rows);

  const suggestedPlans = useMemo(() => {
    const values = new Map<string, { name: string; totalAmountCents: number; source: "Vendor" | "Budget" }>();
    for (const booking of bookings ?? []) {
      const name = booking.vendor?.name?.trim();
      if (name) values.set(vendorKey(name), { name, totalAmountCents: booking.feeCents ?? 0, source: "Vendor" });
    }
    for (const line of budget ?? []) {
      const name = line.name.trim();
      if (line.type === "expense" && name && !values.has(vendorKey(name))) values.set(vendorKey(name), { name, totalAmountCents: line.actualCents ?? line.estimatedCents, source: "Budget" });
    }
    for (const plan of storedPlans) values.delete(vendorKey(plan.vendorName));
    return [...values.values()];
  }, [bookings, budget, storedPlans]);

  const committed = sumCents(storedPlans.map((plan) => plan.totalAmountCents));
  const plannedOutstanding = sumCents(storedPlans.map((plan) => vendorPaymentProgress(plan.totalAmountCents, paymentsForPlan(plan)).remainingCents));
  const plannedIds = new Set(storedPlans.map((plan) => plan.id));
  const plannedVendorKeys = new Set(storedPlans.map((plan) => vendorKey(plan.vendorName)));
  const unplannedOutstanding = sumCents(rows.filter((row) => !(row.paymentPlanId ? plannedIds.has(row.paymentPlanId) : plannedVendorKeys.has(vendorKey(row.vendorName))) && row.status !== "paid" && row.status !== "refunded").map((row) => row.amountCents));
  const outstanding = plannedOutstanding + unplannedOutstanding;
  const overdueVendors = new Set(rows.filter((row) => row.status === "overdue").map((row) => vendorKey(row.vendorName)));
  for (const plan of storedPlans) {
    const remaining = vendorPaymentProgress(plan.totalAmountCents, paymentsForPlan(plan)).remainingCents;
    if (balanceDueState(plan.balanceDueDate, remaining, new Date(), timeZone) === "overdue") overdueVendors.add(vendorKey(plan.vendorName));
  }
  const overdueCount = overdueVendors.size;

  const selectVendor = (name: string) => {
    setVendorName(name);
    const stored = storedPlans.find((plan) => vendorKey(plan.vendorName) === vendorKey(name));
    const suggested = suggestedPlans.find((plan) => vendorKey(plan.name) === vendorKey(name));
    if (stored) {
      setTotalAmount(centsToInput(stored.totalAmountCents));
      setBalanceDueDate(stored.balanceDueDate.slice(0, 10));
    } else if (suggested) setTotalAmount(centsToInput(suggested.totalAmountCents));
  };

  const depositCents = centsFromInput(amount);
  const totalCents = centsFromInput(totalAmount);
  const existingPlan = storedPlans.find((plan) => vendorKey(plan.vendorName) === vendorKey(vendorName));
  const alreadyPaidCents = existingPlan ? vendorPaymentProgress(existingPlan.totalAmountCents, paymentsForPlan(existingPlan)).paidCents : 0;
  const nextPaidCents = alreadyPaidCents + (status === "paid" ? (depositCents ?? 0) : 0);
  const hasDeposit = depositCents != null;
  const validTracker = Boolean(vendorName.trim() && totalCents != null && totalCents >= nextPaidCents && balanceDueDate);
  const loading = depositsQuery.isLoading || plansQuery.isLoading;
  const error = depositsQuery.error ?? plansQuery.error;

  return (
    <div className="space-y-6">
      {error ? <ErrorNotice error={error} onRetry={() => void Promise.all([depositsQuery.refetch(), plansQuery.refetch()])} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Contracted" value={formatMoney(committed)} />
        <StatTile label="Paid" value={formatMoney(paid)} icon={Banknote} />
        <StatTile label="Outstanding" value={formatMoney(outstanding)} />
        <StatTile label="Overdue" value={String(overdueCount)} tone={overdueCount > 0 ? "danger" : "neutral"} sublabel={overdueCount === 0 ? "Nothing past its date" : "Past due and unpaid"} />
      </div>

      {storedPlans.length > 0 || suggestedPlans.length > 0 ? (
        <Panel className="overflow-hidden">
          <PanelHeader title="Vendor payment tracker" description="Follow each contract from deposit payments through the remaining balance and paid-in-full date" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Vendor or expense</TableHead><TableHead className="text-right">Contracted</TableHead><TableHead className="text-right">Deposit history</TableHead><TableHead className="text-right">Remaining balance</TableHead><TableHead>Balance due</TableHead><TableHead>Completed</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {storedPlans.map((plan) => <PaymentPlanRow key={plan.id} eventId={event.id} plan={plan} deposits={paymentsForPlan(plan)} onSelect={selectVendor} />)}
                {suggestedPlans.map((plan) => (
                  <TableRow key={vendorKey(plan.name)}>
                    <TableCell><button type="button" className="text-left font-medium hover:underline" onClick={() => selectVendor(plan.name)}>{plan.name}</button><p className="text-xs text-muted-foreground">Suggested from {plan.source.toLowerCase()}</p></TableCell>
                    <TableCell data-numeric className="text-right">{formatMoney(plan.totalAmountCents)}</TableCell>
                    <TableCell data-numeric className="text-right">{formatMoney(sumCents((paymentGroups.get(`vendor:${vendorKey(plan.name)}`) ?? []).map(depositPaidCents)))}</TableCell>
                    <TableCell data-numeric className="text-right">Set up below</TableCell>
                    <TableCell>Date needed</TableCell>
                    <TableCell className="text-muted-foreground">Not completed</TableCell>
                    <TableCell><Pill tone="warning">not tracked</Pill></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      ) : null}

      <Panel className="overflow-hidden">
        <PanelHeader title="Payment history" description={rows.length ? `${rows.length} vendor payments recorded with paid dates and status` : "Record each deposit paid to a vendor"} />
        <form
          className="grid gap-3 border-b border-hairline px-5 py-4 md:grid-cols-2 xl:grid-cols-6 xl:items-end"
          onSubmit={async (formEvent) => {
            formEvent.preventDefault();
            const trimmed = vendorName.trim();
            if (!validTracker || totalCents == null) return;
            let planSaved = false;
            try {
              const finalDue = dateIso(balanceDueDate)!;
              const savedPlan = existingPlan
                ? await updatePlan.mutateAsync({ eventId: event.id, id: existingPlan.id, patch: { totalAmountCents: totalCents, balanceDueDate: finalDue } })
                : await addPlan.mutateAsync({ eventId: event.id, draft: { vendorName: trimmed, totalAmountCents: totalCents, balanceDueDate: finalDue } });
              planSaved = true;
              if (hasDeposit && depositCents != null) {
                await addDeposit.mutateAsync({ eventId: event.id, draft: { paymentPlanId: savedPlan.id, vendorName: savedPlan.vendorName, amountCents: depositCents, dueDate: dateIso(dueDate), paidDate: status === "paid" ? (dateIso(paymentPaidDate) ?? todayIsoInZone(timeZone)) : null, status } });
              }
              setVendorName(""); setTotalAmount(""); setAmount(""); setDueDate(""); setPaymentPaidDate(""); setBalanceDueDate(""); setStatus("paid");
              toast({ title: hasDeposit ? "Payment tracker saved" : "Vendor payment plan saved" });
            } catch (mutationError) {
              if (planSaved) {
                toast({ title: "Vendor plan saved, but the deposit was not", description: mutationError instanceof Error ? mutationError.message : "Review the payment and try again." });
                return;
              }
              toast({ title: "Couldn't save payment tracker", description: mutationError instanceof Error ? mutationError.message : "Try again." });
            }
          }}
        >
          <label className="space-y-1.5 xl:col-span-2"><span className="text-xs font-medium text-muted-foreground">Vendor</span><Input value={vendorName} onChange={(e) => selectVendor(e.target.value)} placeholder="Vendor name" aria-label="Vendor name" list="deposit-vendor-options" /></label>
          <datalist id="deposit-vendor-options">{[...storedPlans.map((plan) => plan.vendorName), ...suggestedPlans.map((plan) => plan.name)].map((name) => <option key={vendorKey(name)} value={name} />)}</datalist>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Total vendor cost</span><Input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" inputMode="decimal" aria-label="Total vendor cost" className="text-right" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Deposit amount</span><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" aria-label="Deposit amount" className={cn("text-right", totalCents != null && totalCents < nextPaidCents && "border-danger")} /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Remaining balance due</span><Input type="date" value={balanceDueDate} onChange={(e) => setBalanceDueDate(e.target.value)} aria-label="Balance due date" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Deposit status</span><Select value={status} onValueChange={(value) => setStatus(value as DepositStatus)}><SelectTrigger className="capitalize" aria-label="Payment status"><SelectValue /></SelectTrigger><SelectContent>{DEPOSIT_STATUSES.map((option) => <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Deposit due <span className="font-normal">(optional)</span></span><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Deposit due date" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Date paid <span className="font-normal">(defaults to today)</span></span><Input type="date" value={paymentPaidDate} onChange={(e) => setPaymentPaidDate(e.target.value)} aria-label="New payment paid date" disabled={status !== "paid"} /></label>
          <div className="xl:col-span-5">{totalCents != null && depositCents != null ? <p className="text-sm text-muted-foreground">Remaining after all paid deposits: <strong className="text-foreground">{formatMoney(remainingBalanceCents(totalCents, nextPaidCents))}</strong></p> : <p className="text-sm text-muted-foreground">Enter the total cost and deposit to calculate the remaining balance.</p>}</div>
          <Button type="submit" size="sm" disabled={!validTracker || addDeposit.isPending || addPlan.isPending || updatePlan.isPending}><Plus className="mr-1.5 size-3.5" aria-hidden="true" />{hasDeposit ? "Save payment" : "Save plan"}</Button>
        </form>

        {loading ? <div className="p-5"><LoadingRows rows={3} /></div> : rows.length === 0 ? <EmptyState icon={Banknote} title="No deposits recorded" description="Add a vendor total, the deposit paid, and when the remaining balance is due." /> : (
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead className="text-right">Deposit amount</TableHead><TableHead>Deposit due</TableHead><TableHead>Paid date</TableHead><TableHead>Paid by</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead className="sr-only">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((deposit) => {
            const linkedPlan = deposit.paymentPlanId ? storedPlans.find((plan) => plan.id === deposit.paymentPlanId) : null;
            return <DepositRow key={deposit.id} eventId={event.id} deposit={deposit} vendorName={linkedPlan?.vendorName ?? deposit.vendorName} timeZone={timeZone} />;
          })}</TableBody></Table></div>
        )}
      </Panel>

      {overdueCount > 0 ? <p className="text-sm text-muted-foreground"><Pill tone="danger">{overdueCount} overdue</Pill>{" "}{overdueCount === 1 ? "vendor has" : "vendors have"} a payment past its due date.</p> : null}
    </div>
  );
}
