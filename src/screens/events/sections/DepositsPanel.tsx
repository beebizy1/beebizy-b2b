/** Vendor payment plans and the individual deposits paid against them. */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
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
  type VendorPaymentPlanPatch,
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
            if (status === "paid" && !paidBy.trim()) {
              toast({ title: "Add who paid before closing this payment" });
              return;
            }
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

function InlinePaymentTrackerRow({ eventId, vendorName, contractedAmountCents, plan: serverPlan, deposits, sourceLabel }: { eventId: string; vendorName: string; contractedAmountCents: number; plan: VendorPaymentPlan | null; deposits: Deposit[]; sourceLabel: string }) {
  const { timeZone } = usePreferences();
  const addPlan = useAddVendorPaymentPlan();
  const updatePlan = useUpdateVendorPaymentPlan();
  const addDeposit = useAddDeposit();
  const updateDeposit = useUpdateDeposit();
  const [localPlan, setLocalPlan] = useState<VendorPaymentPlan | null>(null);
  const [localDeposit, setLocalDeposit] = useState<Deposit | null>(null);
  const plan = serverPlan ?? localPlan;
  const firstServerDeposit = deposits[0] ?? null;
  const primaryDeposit = firstServerDeposit ?? localDeposit;
  const [depositAmount, setDepositAmount] = useState(centsToInput(primaryDeposit?.amountCents ?? null));
  const [depositStatus, setDepositStatus] = useState<"unpaid" | "paid">(primaryDeposit?.status === "paid" ? "paid" : "unpaid");
  const [balanceDueDate, setBalanceDueDate] = useState(plan?.balanceDueDate?.slice(0, 10) ?? "");
  const [lastPaidBy, setLastPaidBy] = useState(plan?.lastPaidBy ?? primaryDeposit?.paidBy ?? "");
  const [finalStatus, setFinalStatus] = useState<"unpaid" | "paid">(plan?.finalStatus ?? "unpaid");

  useEffect(() => setDepositAmount(centsToInput(primaryDeposit?.amountCents ?? null)), [primaryDeposit?.amountCents]);
  useEffect(() => setDepositStatus(primaryDeposit?.status === "paid" ? "paid" : "unpaid"), [primaryDeposit?.status]);
  useEffect(() => setBalanceDueDate(plan?.balanceDueDate?.slice(0, 10) ?? ""), [plan?.balanceDueDate]);
  useEffect(() => setLastPaidBy(plan?.lastPaidBy ?? primaryDeposit?.paidBy ?? ""), [plan?.lastPaidBy, primaryDeposit?.paidBy]);
  useEffect(() => setFinalStatus(plan?.finalStatus ?? "unpaid"), [plan?.finalStatus]);

  const ensurePlan = async () => {
    if (plan) return plan;
    const created = await addPlan.mutateAsync({ eventId, draft: { vendorName, totalAmountCents: contractedAmountCents, balanceDueDate: dateIso(balanceDueDate), lastPaidBy: lastPaidBy.trim() || null, finalStatus } });
    setLocalPlan(created);
    return created;
  };

  const saveDepositAmount = async () => {
    const cents = centsFromInput(depositAmount);
    if (cents == null) return;
    try {
      const savedPlan = await ensurePlan();
      if (primaryDeposit) {
        await updateDeposit.mutateAsync({ eventId, id: primaryDeposit.id, patch: { amountCents: cents } });
      } else {
        const created = await addDeposit.mutateAsync({ eventId, draft: { paymentPlanId: savedPlan.id, vendorName, amountCents: cents, status: depositStatus === "paid" ? "paid" : "pending", paidDate: depositStatus === "paid" ? todayIsoInZone(timeZone) : null, paidBy: lastPaidBy.trim() || null } });
        setLocalDeposit(created);
      }
    } catch (error) {
      setDepositAmount(centsToInput(primaryDeposit?.amountCents ?? null));
      toast({ title: "Couldn't save deposit", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const saveDepositStatus = async (next: "unpaid" | "paid") => {
    const cents = centsFromInput(depositAmount);
    if (cents == null) {
      toast({ title: "Enter the deposit amount first" });
      return;
    }
    setDepositStatus(next);
    try {
      const savedPlan = await ensurePlan();
      const patch = { status: next === "paid" ? "paid" as const : "pending" as const, paidDate: next === "paid" ? todayIsoInZone(timeZone) : null, paidBy: next === "paid" ? (lastPaidBy.trim() || null) : null };
      if (primaryDeposit) await updateDeposit.mutateAsync({ eventId, id: primaryDeposit.id, patch });
      else setLocalDeposit(await addDeposit.mutateAsync({ eventId, draft: { paymentPlanId: savedPlan.id, vendorName, amountCents: cents, ...patch } }));
    } catch (error) {
      setDepositStatus(primaryDeposit?.status === "paid" ? "paid" : "unpaid");
      toast({ title: "Couldn't update deposit status", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const savePlanPatch = async (patch: VendorPaymentPlanPatch) => {
    try {
      if (plan) await updatePlan.mutateAsync({ eventId, id: plan.id, patch });
      else setLocalPlan(await addPlan.mutateAsync({ eventId, draft: { vendorName, totalAmountCents: contractedAmountCents, balanceDueDate: dateIso(balanceDueDate), lastPaidBy: lastPaidBy.trim() || null, finalStatus, ...patch } }));
    } catch (error) {
      toast({ title: "Couldn't update payment tracker", description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const allEnteredDeposits = deposits.filter((deposit) => deposit.status !== "refunded");
  const otherDepositCents = allEnteredDeposits.filter((deposit) => deposit.id !== primaryDeposit?.id).reduce((total, deposit) => total + deposit.amountCents, 0);
  const currentDepositCents = centsFromInput(depositAmount) ?? primaryDeposit?.amountCents ?? 0;
  const remainingCents = finalStatus === "paid" ? 0 : remainingBalanceCents(contractedAmountCents, otherDepositCents + currentDepositCents);

  return (
    <TableRow>
      <TableCell className="min-w-48"><p className="font-medium text-foreground">{vendorName}</p><p className="text-xs text-muted-foreground">{sourceLabel}</p></TableCell>
      <TableCell data-numeric className="min-w-32 text-right"><p className="font-semibold">{formatMoney(contractedAmountCents)}</p><Link href={`/app/events/${eventId}/budget`} className="text-[11px] text-primary-text hover:underline">Budget & Return</Link></TableCell>
      <TableCell className="min-w-32"><Input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} onBlur={() => void saveDepositAmount()} inputMode="decimal" aria-label={`Deposit amount for ${vendorName}`} className="h-8 text-right" /></TableCell>
      <TableCell className="min-w-32"><Select value={depositStatus} onValueChange={(value) => void saveDepositStatus(value as "unpaid" | "paid")}><SelectTrigger className="h-8" aria-label={`Deposit status for ${vendorName}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unpaid">Unpaid</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select></TableCell>
      <TableCell className="min-w-40"><Input type="date" value={balanceDueDate} onChange={(event) => setBalanceDueDate(event.target.value)} onBlur={() => void savePlanPatch({ balanceDueDate: dateIso(balanceDueDate) })} aria-label={`Balance due date for ${vendorName}`} className="h-8" /></TableCell>
      <TableCell className="min-w-40"><Input value={lastPaidBy} onChange={(event) => setLastPaidBy(event.target.value)} onBlur={() => void savePlanPatch({ lastPaidBy: lastPaidBy.trim() || null })} placeholder="Person or account" aria-label={`Last paid by for ${vendorName}`} className="h-8" /></TableCell>
      <TableCell className="min-w-36"><Select value={finalStatus} onValueChange={(value) => { const next = value as "unpaid" | "paid"; if (next === "paid" && !lastPaidBy.trim()) { toast({ title: "Add who made the final payment first" }); return; } setFinalStatus(next); void savePlanPatch({ finalStatus: next, lastPaidBy: lastPaidBy.trim() || null }); }}><SelectTrigger className="h-8" aria-label={`Final payment status for ${vendorName}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unpaid">Unpaid</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select></TableCell>
      <TableCell data-numeric className="min-w-36 text-right font-semibold">{formatMoney(remainingCents)}</TableCell>
    </TableRow>
  );
}

export default function DepositsPanel({ event }: { event: Event }) {
  const { timeZone } = usePreferences();
  const depositsQuery = useDeposits(event.id);
  const plansQuery = useVendorPaymentPlans(event.id);
  const { data: bookings } = useEventVendors(event.id);
  const addDeposit = useAddDeposit();
  const addPlan = useAddVendorPaymentPlan();
  const updatePlan = useUpdateVendorPaymentPlan();
  const [vendorName, setVendorName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentPaidDate, setPaymentPaidDate] = useState("");
  const [newPaymentPaidBy, setNewPaymentPaidBy] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [balanceDueDate, setBalanceDueDate] = useState("");
  const [status, setStatus] = useState<DepositStatus>("paid");
  const [planFilter, setPlanFilter] = useState<"all" | "due" | "overdue" | "paid">("all");

  const rows = useMemo(() => depositsQuery.data ?? [], [depositsQuery.data]);
  const storedPlans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const paid = sumCents(rows.map(depositPaidCents));
  const paymentGroups = useMemo(() => {
    const values = new Map<string, Deposit[]>();
    for (const row of rows) values.set(paymentKey(row), [...(values.get(paymentKey(row)) ?? []), row]);
    return values;
  }, [rows]);
  const bookingByVendorKey = useMemo(() => new Map((bookings ?? []).flatMap((booking, index) => {
    const name = booking.vendor?.name?.trim();
    return name ? [[vendorKey(name), { booking, index }] as const] : [];
  })), [bookings]);
  const paymentsForPlan = (plan: VendorPaymentPlan) => vendorPaymentPlanDeposits(plan, rows);
  const trackedPlans = storedPlans.map((plan) => {
    const deposits = paymentsForPlan(plan);
    const bookedVendor = bookingByVendorKey.get(vendorKey(plan.vendorName));
    const contractedAmountCents = bookedVendor?.booking.feeCents ?? plan.totalAmountCents;
    const calculatedProgress = vendorPaymentProgress(contractedAmountCents, deposits);
    const progress = plan.finalStatus === "paid"
      ? { ...calculatedProgress, remainingCents: 0, completedAt: plan.finalPaidAt, completedBy: plan.lastPaidBy, lastPaidAt: plan.finalPaidAt ?? calculatedProgress.lastPaidAt, lastPaidBy: plan.lastPaidBy ?? calculatedProgress.lastPaidBy }
      : calculatedProgress;
    return {
      plan,
      contractedAmountCents,
      syncedFromBudget: bookedVendor?.booking.feeCents != null,
      vendorOrder: bookedVendor?.index ?? Number.MAX_SAFE_INTEGER,
      progress,
      dueState: balanceDueState(plan.balanceDueDate, progress.remainingCents, new Date(), timeZone),
    };
  }).sort((a, b) => a.vendorOrder - b.vendorOrder || a.plan.vendorName.localeCompare(b.plan.vendorName));

  const suggestedPlans = useMemo(() => {
    const values = new Map<string, { name: string; totalAmountCents: number; vendorOrder: number }>();
    for (const [index, booking] of (bookings ?? []).entries()) {
      const name = booking.vendor?.name?.trim();
      if (name) values.set(vendorKey(name), { name, totalAmountCents: booking.feeCents ?? 0, vendorOrder: index });
    }
    for (const plan of storedPlans) values.delete(vendorKey(plan.vendorName));
    return [...values.values()];
  }, [bookings, storedPlans]);

  const trackerRows = [
    ...trackedPlans.map((row) => ({ kind: "tracked" as const, vendorOrder: row.vendorOrder, row })),
    ...suggestedPlans.map((row) => ({ kind: "suggested" as const, vendorOrder: row.vendorOrder, row })),
  ].sort((a, b) => a.vendorOrder - b.vendorOrder || (a.kind === "tracked" ? a.row.plan.vendorName : a.row.name).localeCompare(b.kind === "tracked" ? b.row.plan.vendorName : b.row.name));
  const committed = sumCents(trackerRows.map((entry) => entry.kind === "tracked" ? entry.row.contractedAmountCents : entry.row.totalAmountCents));
  const plannedOutstanding = sumCents(trackedPlans.map(({ progress }) => progress.remainingCents));
  const plannedIds = new Set(storedPlans.map((plan) => plan.id));
  const plannedVendorKeys = new Set(storedPlans.map((plan) => vendorKey(plan.vendorName)));
  const unplannedOutstanding = sumCents(rows.filter((row) => !(row.paymentPlanId ? plannedIds.has(row.paymentPlanId) : plannedVendorKeys.has(vendorKey(row.vendorName))) && row.status !== "paid" && row.status !== "refunded").map((row) => row.amountCents));
  const outstanding = plannedOutstanding + unplannedOutstanding;
  const overdueVendors = new Set(rows.filter((row) => row.status === "overdue").map((row) => vendorKey(row.vendorName)));
  for (const { plan, dueState } of trackedPlans) {
    if (dueState === "overdue") overdueVendors.add(vendorKey(plan.vendorName));
  }
  const overdueCount = overdueVendors.size;
  const trackedOverdueCount = trackedPlans.filter(({ dueState }) => dueState === "overdue").length;
  const paidInFullCount = trackedPlans.filter(({ plan }) => plan.finalStatus === "paid").length;
  const balanceDueCount = trackedPlans.filter(({ progress }) => progress.remainingCents > 0).length;
  const visibleTrackerRows = trackerRows.filter((entry) => {
    if (planFilter === "all") return true;
    if (entry.kind === "suggested") return false;
    const { progress, dueState } = entry.row;
    return (planFilter === "due" && progress.remainingCents > 0)
      || (planFilter === "overdue" && dueState === "overdue")
      || (planFilter === "paid" && entry.row.plan.finalStatus === "paid");
  });

  const selectVendor = (name: string) => {
    setVendorName(name);
    const stored = storedPlans.find((plan) => vendorKey(plan.vendorName) === vendorKey(name));
    const suggested = suggestedPlans.find((plan) => vendorKey(plan.name) === vendorKey(name));
    const booking = bookingByVendorKey.get(vendorKey(name))?.booking;
    if (stored) {
      setTotalAmount(centsToInput(booking?.feeCents ?? stored.totalAmountCents));
      setBalanceDueDate(stored.balanceDueDate?.slice(0, 10) ?? "");
    } else if (suggested) setTotalAmount(centsToInput(suggested.totalAmountCents));
  };

  const depositCents = centsFromInput(amount);
  const totalCents = centsFromInput(totalAmount);
  const existingPlan = storedPlans.find((plan) => vendorKey(plan.vendorName) === vendorKey(vendorName));
  const selectedBooking = bookingByVendorKey.get(vendorKey(vendorName))?.booking;
  const alreadyPaidCents = existingPlan ? (trackedPlans.find(({ plan }) => plan.id === existingPlan.id)?.progress.paidCents ?? 0) : 0;
  const nextPaidCents = alreadyPaidCents + (status === "paid" ? (depositCents ?? 0) : 0);
  const hasDeposit = depositCents != null;
  const validTracker = Boolean(vendorName.trim() && totalCents != null && totalCents >= nextPaidCents && (!hasDeposit || status !== "paid" || newPaymentPaidBy.trim()));
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
          <PanelHeader title="Vendor payment tracker" description="Vendors stay in the same order as the Vendors tab, with contracted amounts synced from Budget & Return" />
          <div className="flex flex-wrap gap-2 border-b border-hairline px-5 py-3" aria-label="Filter vendor payment plans">
            {([
              ["all", `All ${trackerRows.length}`],
              ["due", `Balance due ${balanceDueCount}`],
              ["overdue", `Overdue ${trackedOverdueCount}`],
              ["paid", `Paid in full ${paidInFullCount}`],
            ] as const).map(([value, label]) => (
              <Button key={value} type="button" variant={planFilter === value ? "default" : "outline"} size="sm" aria-pressed={planFilter === value} onClick={() => setPlanFilter(value)}>{label}</Button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Vendor or expense</TableHead><TableHead className="text-right">Contracted</TableHead><TableHead>Deposit amount</TableHead><TableHead>Deposit status</TableHead><TableHead>Balance due</TableHead><TableHead>Last paid by</TableHead><TableHead>Final payment</TableHead><TableHead className="text-right">Remaining balance</TableHead></TableRow></TableHeader>
              <TableBody>
                {visibleTrackerRows.map((entry) => entry.kind === "tracked" ? (
                  <InlinePaymentTrackerRow key={entry.row.plan.id} eventId={event.id} vendorName={entry.row.plan.vendorName} contractedAmountCents={entry.row.contractedAmountCents} plan={entry.row.plan} deposits={paymentsForPlan(entry.row.plan)} sourceLabel={entry.row.syncedFromBudget ? "Synced from Budget & Return" : "Payment plan"} />
                ) : (
                  <InlinePaymentTrackerRow key={vendorKey(entry.row.name)} eventId={event.id} vendorName={entry.row.name} contractedAmountCents={entry.row.totalAmountCents} plan={null} deposits={paymentGroups.get(`vendor:${vendorKey(entry.row.name)}`) ?? []} sourceLabel="Synced from Budget & Return" />
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
              const finalDue = dateIso(balanceDueDate);
              const savedPlan = existingPlan
                ? await updatePlan.mutateAsync({ eventId: event.id, id: existingPlan.id, patch: { totalAmountCents: totalCents, balanceDueDate: finalDue } })
                : await addPlan.mutateAsync({ eventId: event.id, draft: { vendorName: trimmed, totalAmountCents: totalCents, balanceDueDate: finalDue } });
              planSaved = true;
              if (hasDeposit && depositCents != null) {
                await addDeposit.mutateAsync({ eventId: event.id, draft: { paymentPlanId: savedPlan.id, vendorName: savedPlan.vendorName, amountCents: depositCents, dueDate: dateIso(dueDate), paidDate: status === "paid" ? (dateIso(paymentPaidDate) ?? todayIsoInZone(timeZone)) : null, paidBy: newPaymentPaidBy.trim() || null, paymentMethod: newPaymentMethod.trim() || null, status } });
              }
              setVendorName(""); setTotalAmount(""); setAmount(""); setDueDate(""); setPaymentPaidDate(""); setNewPaymentPaidBy(""); setNewPaymentMethod(""); setBalanceDueDate(""); setStatus("paid");
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
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Total vendor cost</span><Input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" inputMode="decimal" aria-label="Total vendor cost" className="text-right" disabled={Boolean(selectedBooking?.feeCents != null)} />{selectedBooking?.feeCents != null ? <Link href={`/app/events/${event.id}/budget`} className="block text-[11px] text-primary-text hover:underline">Edit in Budget & Return</Link> : null}</label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Deposit amount</span><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" aria-label="Deposit amount" className={cn("text-right", totalCents != null && totalCents < nextPaidCents && "border-danger")} /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Remaining balance due</span><Input type="date" value={balanceDueDate} onChange={(e) => setBalanceDueDate(e.target.value)} aria-label="Balance due date" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Deposit status</span><Select value={status} onValueChange={(value) => setStatus(value as DepositStatus)}><SelectTrigger className="capitalize" aria-label="Payment status"><SelectValue /></SelectTrigger><SelectContent>{DEPOSIT_STATUSES.map((option) => <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Deposit due <span className="font-normal">(optional)</span></span><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Deposit due date" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Date paid <span className="font-normal">(defaults to today)</span></span><Input type="date" value={paymentPaidDate} onChange={(e) => setPaymentPaidDate(e.target.value)} aria-label="New payment paid date" disabled={status !== "paid"} /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Paid by {status === "paid" ? <span className="text-danger-text">(required)</span> : null}</span><Input value={newPaymentPaidBy} onChange={(e) => setNewPaymentPaidBy(e.target.value)} placeholder="Person or account" aria-label="New payment paid by" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Method</span><Input value={newPaymentMethod} onChange={(e) => setNewPaymentMethod(e.target.value)} placeholder="Wire, check, card" aria-label="New payment method" /></label>
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
