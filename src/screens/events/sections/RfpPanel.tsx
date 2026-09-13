/**
 * Requests for proposal, and the quotes that came back.
 *
 * An RFP is a question put to a market, so the budget is a range and the replies are the
 * point. Each RFP renders with its responses inline — the adapter attaches them to the
 * list read, so opening one costs no extra fetch.
 */

import { useState } from "react";
import { FileText, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/app/preferences";
import { centsFromInput, formatMoney } from "@/data/money";
import {
  useAddRfp,
  useAddRfpResponse,
  useRemoveRfp,
  useRemoveRfpResponse,
  useRfps,
  useSetRfpResponseStatus,
  useUpdateRfp,
} from "@/data/hooks";
import {
  RFP_RESPONSE_STATUSES,
  VENDOR_CATEGORIES,
  type Event,
  type RfpResponseStatus,
  type RfpStatus,
  type RfpWithResponses,
} from "@/data/entities";

const RFP_TONE: Record<RfpStatus, "neutral" | "info" | "success"> = {
  draft: "neutral",
  sent: "info",
  closed: "success",
};

/** A quote's status is the whole point of the row, so the control shows it in colour. */
const RESPONSE_TONE: Record<RfpResponseStatus, string> = {
  pending: "text-muted-foreground",
  received: "text-info-text",
  accepted: "text-success-text font-semibold",
  declined: "text-danger-text",
};

function budgetRange(rfp: RfpWithResponses): string | null {
  if (rfp.budgetMinCents == null && rfp.budgetMaxCents == null) return null;
  if (rfp.budgetMinCents != null && rfp.budgetMaxCents != null) {
    return `${formatMoney(rfp.budgetMinCents)} – ${formatMoney(rfp.budgetMaxCents)}`;
  }
  return formatMoney(rfp.budgetMinCents ?? rfp.budgetMaxCents);
}

function ResponseRow({
  eventId,
  rfpId,
  response,
}: {
  eventId: string;
  rfpId: string;
  response: RfpWithResponses["responses"][number];
}) {
  const setStatus = useSetRfpResponseStatus();
  const remove = useRemoveRfpResponse();

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{response.vendorName}</p>
        <p className="truncate text-sm text-muted-foreground">
          {response.contactName ?? response.contactEmail ?? "No contact on file"}
          {response.notes ? ` · ${response.notes}` : ""}
        </p>
      </div>

      <span data-numeric className="shrink-0 text-sm font-medium text-foreground">
        {response.quotedAmountCents == null ? "No quote yet" : formatMoney(response.quotedAmountCents)}
      </span>

      <Select
        value={response.status}
        onValueChange={(value) =>
          setStatus.mutate(
            { eventId, rfpId, responseId: response.id, status: value as RfpResponseStatus },
            { onError: (error) => toast({ title: "Couldn't update reply", description: error.message }) },
          )
        }
      >
        <SelectTrigger
          className={cn("w-[130px] capitalize", RESPONSE_TONE[response.status])}
          aria-label={`Status for ${response.vendorName}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RFP_RESPONSE_STATUSES.map((option) => (
            <SelectItem key={option} value={option} className="capitalize">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${response.vendorName}`}
        onClick={() =>
          remove.mutate(
            { eventId, rfpId, responseId: response.id },
            { onError: (error) => toast({ title: "Couldn't remove reply", description: error.message }) },
          )
        }
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

function AddResponse({ eventId, rfpId }: { eventId: string; rfpId: string }) {
  const add = useAddRfpResponse();
  const [vendorName, setVendorName] = useState("");
  const [quote, setQuote] = useState("");

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        const trimmed = vendorName.trim();
        if (!trimmed) return;
        add.mutate(
          {
            eventId,
            rfpId,
            draft: { vendorName: trimmed, quotedAmountCents: centsFromInput(quote), status: "received" },
          },
          {
            onSuccess: () => {
              setVendorName("");
              setQuote("");
            },
            onError: (error) => toast({ title: "Couldn't log the reply", description: error.message }),
          },
        );
      }}
    >
      <Input
        value={vendorName}
        onChange={(inputEvent) => setVendorName(inputEvent.target.value)}
        placeholder="Vendor who replied…"
        aria-label="Vendor name"
        className="min-w-[10rem] flex-1"
      />
      <Input
        value={quote}
        onChange={(inputEvent) => setQuote(inputEvent.target.value)}
        placeholder="Quote"
        inputMode="decimal"
        aria-label="Quoted amount"
        className="w-32 text-right"
      />
      <Button type="submit" size="sm" variant="outline" disabled={!vendorName.trim() || add.isPending}>
        <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
        Log reply
      </Button>
    </form>
  );
}

function RfpCard({ eventId, rfp }: { eventId: string; rfp: RfpWithResponses }) {
  const { date: formatDate } = usePreferences();
  const update = useUpdateRfp();
  const remove = useRemoveRfp();
  const range = budgetRange(rfp);

  return (
    <Panel>
      <PanelHeader
        title={rfp.title}
        description={[
          rfp.vendorCategory,
          range,
          rfp.headcount ? `${rfp.headcount} guests` : null,
          rfp.deadline ? `replies by ${formatDate(rfp.deadline, "dayMonthYear")}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Pill tone={RFP_TONE[rfp.status]}>{rfp.status}</Pill>
            {rfp.status === "draft" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update.mutate(
                    { eventId, id: rfp.id, patch: { status: "sent" } },
                    {
                      onSuccess: () => toast({ title: "RFP marked as sent" }),
                      onError: (error) => toast({ title: "Couldn't update RFP", description: error.message }),
                    },
                  )
                }
              >
                <Send className="mr-1.5 size-3.5" aria-hidden="true" />
                Mark sent
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${rfp.title}`}
              onClick={() =>
                remove.mutate(
                  { eventId, id: rfp.id },
                  {
                    onSuccess: () => toast({ title: "RFP deleted" }),
                    onError: (error) => toast({ title: "Couldn't delete RFP", description: error.message }),
                  },
                )
              }
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </>
        }
      />

      {rfp.description || rfp.requirements ? (
        <div className="space-y-1.5 border-b border-hairline px-5 py-3 text-sm">
          {rfp.description ? <p className="text-foreground">{rfp.description}</p> : null}
          {rfp.requirements ? <p className="text-muted-foreground">{rfp.requirements}</p> : null}
        </div>
      ) : null}

      {rfp.responses.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No replies yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {rfp.responses.map((response) => (
            <ResponseRow key={response.id} eventId={eventId} rfpId={rfp.id} response={response} />
          ))}
        </ul>
      )}

      <AddResponse eventId={eventId} rfpId={rfp.id} />
    </Panel>
  );
}

function NewRfp({ event }: { event: Event }) {
  const add = useAddRfp();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Catering");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [requirements, setRequirements] = useState("");

  return (
    <Panel>
      <PanelHeader title="New RFP" description="Put one brief out to a category and collect the quotes here" />
      <form
        className="space-y-4 p-5"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          add.mutate(
            {
              eventId: event.id,
              draft: {
                title: trimmed,
                vendorCategory: category,
                budgetMinCents: centsFromInput(budgetMin),
                budgetMaxCents: centsFromInput(budgetMax),
                headcount: event.capacity,
                requirements: requirements.trim() || null,
              },
            },
            {
              onSuccess: () => {
                setTitle("");
                setBudgetMin("");
                setBudgetMax("");
                setRequirements("");
                toast({ title: "RFP created", description: "It starts as a draft." });
              },
              onError: (error) => toast({ title: "Couldn't create RFP", description: error.message }),
            },
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rfp-title">Title</Label>
            <Input
              id="rfp-title"
              value={title}
              onChange={(inputEvent) => setTitle(inputEvent.target.value)}
              placeholder="Plated dinner service for 300"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-category">Vendor category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="rfp-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-budget-min">Budget from</Label>
            <Input
              id="rfp-budget-min"
              value={budgetMin}
              onChange={(inputEvent) => setBudgetMin(inputEvent.target.value)}
              placeholder="24,000"
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-budget-max">Budget to</Label>
            <Input
              id="rfp-budget-max"
              value={budgetMax}
              onChange={(inputEvent) => setBudgetMax(inputEvent.target.value)}
              placeholder="32,000"
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rfp-requirements">Requirements</Label>
          <Textarea
            id="rfp-requirements"
            value={requirements}
            onChange={(inputEvent) => setRequirements(inputEvent.target.value)}
            placeholder="Dietary tracking, two bars, load-in from 2pm…"
            rows={2}
          />
        </div>

        <div className="flex justify-end border-t border-hairline pt-4">
          <Button type="submit" disabled={!title.trim() || add.isPending}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            Create RFP
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export default function RfpPanel({ event }: { event: Event }) {
  const { data: rfps, isLoading, isError, error, refetch } = useRfps(event.id);

  return (
    <div className="space-y-6">
      {isError ? <ErrorNotice error={error} onRetry={() => void refetch()} /> : null}

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : (rfps?.length ?? 0) === 0 ? (
        <Panel>
          <EmptyState
            icon={FileText}
            title="No RFPs yet"
            description="Write one brief, send it to a category of vendors, and keep every quote against it."
          />
        </Panel>
      ) : (
        rfps?.map((rfp) => <RfpCard key={rfp.id} eventId={event.id} rfp={rfp} />)
      )}

      <NewRfp event={event} />
    </div>
  );
}
