import { useState } from "react";
import { Check, Plus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelHeader, Pill } from "@/components/primitives";
import { useAddTicketType, useTickets, useUpdateTicketType } from "@/data/hooks";
import { centsFromInput, centsToInput, formatMoney } from "@/data/money";
import { ticketDraftFromForm } from "@/data/ticketDraft";
import type { Event, TicketType } from "@/data/entities";
import { toast } from "@/hooks/use-toast";

export default function GuidedTicketPricing({ event, onDone }: { event: Event; onDone?: () => void }) {
  const { data: tickets } = useTickets(event.id);
  const addTicket = useAddTicketType();
  const updateTicket = useUpdateTicketType();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [benefitValue, setBenefitValue] = useState("");
  const [zeroBenefitConfirmed, setZeroBenefitConfirmed] = useState(false);
  const activeTickets = (tickets ?? []).filter((ticket) => ticket.isActive);
  const priceCents = centsFromInput(price);
  const benefitCents = centsFromInput(benefitValue);
  const paid = (priceCents ?? 0) > 0;
  const busy = addTicket.isPending || updateTicket.isPending;

  const clear = () => {
    setEditingId(null);
    setName("");
    setPrice("");
    setQuantity("");
    setBenefitValue("");
    setZeroBenefitConfirmed(false);
  };

  const edit = (ticket: TicketType) => {
    setEditingId(ticket.id);
    setName(ticket.name);
    setPrice(centsToInput(ticket.priceCents));
    setQuantity(ticket.quantityTotal === 0 ? "" : String(ticket.quantityTotal));
    setBenefitValue(ticket.fairMarketValueCents == null ? "" : centsToInput(ticket.fairMarketValueCents));
    setZeroBenefitConfirmed(ticket.fmvZeroConfirmed === true);
  };

  const save = () => {
    const draft = ticketDraftFromForm({ name, price, quantity, fairMarketValue: benefitValue, zeroValueConfirmed: zeroBenefitConfirmed });
    if (!draft) return;
    const options = { onSuccess: () => { toast({ title: editingId ? "Ticket updated" : "Ticket added" }); clear(); onDone?.(); }, onError: (error: Error) => toast({ title: "Couldn't save ticket", description: error.message }) };
    if (editingId) updateTicket.mutate({ eventId: event.id, id: editingId, patch: draft }, options);
    else addTicket.mutate({ eventId: event.id, draft }, options);
  };

  return (
    <Panel>
      <PanelHeader title="Price your tickets" description="Keep it simple: name the ticket, set the price, and say how many can be sold." />
      {activeTickets.length > 0 ? <ul className="divide-y divide-hairline border-b border-hairline">{activeTickets.map((ticket) => <li key={ticket.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><span className="grid size-8 place-items-center rounded-lg bg-primary-muted text-primary"><Ticket className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{ticket.name}</p><p className="text-xs text-muted-foreground">{ticket.quantityTotal === 0 ? "Unlimited" : `${ticket.quantityTotal - ticket.quantitySold} available`}</p></div><strong data-numeric className="text-sm">{ticket.priceCents ? formatMoney(ticket.priceCents) : "Free"}</strong><Button type="button" size="sm" variant="outline" onClick={() => edit(ticket)}>Edit</Button></li>)}</ul> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="guided-ticket-name">Ticket name</Label><Input id="guided-ticket-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="General admission" /></div>
        <div className="space-y-1.5"><Label htmlFor="guided-ticket-price">Price per ticket</Label><Input id="guided-ticket-price" value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="150.00" /></div>
        <div className="space-y-1.5"><Label htmlFor="guided-ticket-quantity">How many can be sold?</Label><Input id="guided-ticket-quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" placeholder="Leave blank for unlimited" /></div>
        {paid ? <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="guided-ticket-benefit">Value of the meal or benefits included</Label><Input id="guided-ticket-benefit" value={benefitValue} onChange={(event) => setBenefitValue(event.target.value)} inputMode="decimal" placeholder="Example: 75.00" /><p className="text-xs text-muted-foreground">This helps calculate the receipt. Ask the school's finance person if you are unsure.</p></div> : null}
        {paid && benefitCents === 0 ? <label className="flex items-center gap-2 text-xs text-warning-text sm:col-span-3"><input type="checkbox" checked={zeroBenefitConfirmed} onChange={(event) => setZeroBenefitConfirmed(event.target.checked)} />I confirm this paid ticket gives the guest nothing of value in return.</label> : null}
        <div className="flex flex-wrap gap-2 sm:col-span-3"><Button type="button" disabled={busy || !name.trim() || priceCents == null || (paid && benefitCents == null) || (paid && benefitCents === 0 && !zeroBenefitConfirmed)} onClick={save}>{editingId ? <Check className="mr-1.5 size-4" /> : <Plus className="mr-1.5 size-4" />}{busy ? "Saving…" : editingId ? "Save ticket" : "Add ticket"}</Button>{editingId ? <Button type="button" variant="outline" onClick={clear}>Cancel</Button> : null}{activeTickets.length > 0 ? <Pill tone="success">{activeTickets.length} ready</Pill> : null}</div>
      </div>
    </Panel>
  );
}
