/**
 * Deposits committed to vendors ahead of the event.
 *
 * `status` is stored, not derived from the due date, because "overdue" is a judgement
 * someone made about an unpaid deposit — a deposit can be past its due date and still
 * agreed as fine. The header totals split paid from outstanding, which is the number
 * anyone actually opens this tab for.
 */

import { useState } from "react";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill, StatTile } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/app/preferences";
import { centsFromInput, formatMoney, sumCents } from "@/data/money";
import { useAddDeposit, useDeposits, useRemoveDeposit, useUpdateDeposit } from "@/data/hooks";
import { DEPOSIT_STATUSES, type Deposit, type DepositStatus, type Event } from "@/data/entities";

/** Status carries meaning, so the control that shows it wears the meaning too. */
const TONE: Record<DepositStatus, string> = {
  pending: "text-muted-foreground",
  paid: "text-success-text",
  overdue: "text-danger-text font-semibold",
  refunded: "text-info-text",
};

function DepositRow({ eventId, deposit }: { eventId: string; deposit: Deposit }) {
  const { date: formatDate } = usePreferences();
  const update = useUpdateDeposit();
  const remove = useRemoveDeposit();

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{deposit.vendorName}</TableCell>
      <TableCell data-numeric className="text-right">
        {formatMoney(deposit.amountCents)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {deposit.dueDate ? formatDate(deposit.dueDate, "dayMonthYear") : "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {deposit.paidDate ? formatDate(deposit.paidDate, "dayMonthYear") : "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">{deposit.paidBy ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{deposit.paymentMethod ?? "—"}</TableCell>
      <TableCell>
        <Select
          value={deposit.status}
          onValueChange={(value) => {
            const status = value as DepositStatus;
            update.mutate(
              {
                eventId,
                id: deposit.id,
                patch: {
                  status,
                  // Marking it paid without a date would leave the ledger unanswerable.
                  paidDate: status === "paid" ? (deposit.paidDate ?? new Date().toISOString()) : deposit.paidDate,
                },
              },
              { onError: (error) => toast({ title: "Couldn't update deposit", description: error.message }) },
            );
          }}
        >
          <SelectTrigger className={cn("w-[120px] capitalize", TONE[deposit.status])} aria-label={`Status for ${deposit.vendorName}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEPOSIT_STATUSES.map((option) => (
              <SelectItem key={option} value={option} className="capitalize">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete deposit for ${deposit.vendorName}`}
          onClick={() =>
            remove.mutate(
              { eventId, id: deposit.id },
              { onError: (error) => toast({ title: "Couldn't delete deposit", description: error.message }) },
            )
          }
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function DepositsPanel({ event }: { event: Event }) {
  const { data: deposits, isLoading, isError, error, refetch } = useDeposits(event.id);
  const add = useAddDeposit();
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const rows = deposits ?? [];
  const paid = sumCents(rows.filter((d) => d.status === "paid").map((d) => d.amountCents));
  const outstanding = sumCents(
    rows.filter((d) => d.status === "pending" || d.status === "overdue").map((d) => d.amountCents),
  );
  const overdueCount = rows.filter((d) => d.status === "overdue").length;

  return (
    <div className="space-y-6">
      {isError ? <ErrorNotice error={error} onRetry={() => void refetch()} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Paid" value={formatMoney(paid)} icon={Banknote} />
        <StatTile label="Outstanding" value={formatMoney(outstanding)} />
        <StatTile
          label="Overdue"
          value={String(overdueCount)}
          tone={overdueCount > 0 ? "danger" : "neutral"}
          sublabel={overdueCount === 0 ? "Nothing past its date" : "Past due and unpaid"}
        />
      </div>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Deposits"
          description={rows.length ? `${rows.length} recorded against this event` : "Money committed before the day"}
        />

        <form
          className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            const trimmed = vendorName.trim();
            const cents = centsFromInput(amount);
            if (!trimmed || cents == null) return;
            add.mutate(
              {
                eventId: event.id,
                draft: { vendorName: trimmed, amountCents: cents, dueDate: dueDate ? new Date(dueDate).toISOString() : null },
              },
              {
                onSuccess: () => {
                  setVendorName("");
                  setAmount("");
                  setDueDate("");
                },
                onError: (mutationError) =>
                  toast({ title: "Couldn't add deposit", description: mutationError.message }),
              },
            );
          }}
        >
          <Input
            value={vendorName}
            onChange={(inputEvent) => setVendorName(inputEvent.target.value)}
            placeholder="Vendor…"
            aria-label="Vendor name"
            className="min-w-[10rem] flex-1"
          />
          <Input
            value={amount}
            onChange={(inputEvent) => setAmount(inputEvent.target.value)}
            placeholder="Amount"
            inputMode="decimal"
            aria-label="Deposit amount"
            className="w-32 text-right"
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(inputEvent) => setDueDate(inputEvent.target.value)}
            aria-label="Due date"
            className="w-40"
          />
          <Button type="submit" size="sm" disabled={!vendorName.trim() || centsFromInput(amount) == null || add.isPending}>
            <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
            Add deposit
          </Button>
        </form>

        {isLoading ? (
          <div className="p-5">
            <LoadingRows rows={3} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No deposits recorded"
            description="Track what has been committed to each vendor and what is still outstanding."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((deposit) => (
                  <DepositRow key={deposit.id} eventId={event.id} deposit={deposit} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {overdueCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          <Pill tone="danger">{overdueCount} overdue</Pill>{" "}
          {overdueCount === 1 ? "deposit is" : "deposits are"} past their due date and still unpaid.
        </p>
      ) : null}
    </div>
  );
}
