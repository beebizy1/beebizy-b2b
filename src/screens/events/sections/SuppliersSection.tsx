/**
 * Suppliers: who is delivering what, and whether they've said yes.
 *
 * Booking status is the single most load-bearing field in the product — an unconfirmed
 * caterer ten days out is the risk that shows up on Today — so it is editable inline
 * here rather than three clicks deep.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { MessageSquare, Plus, Store, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  BookingStatusBadge,
  EmptyState,
  ErrorNotice,
  KeyValue,
  LoadingRows,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/primitives";
import {
  useAddEventVendor,
  useAddMenuItem,
  useEventVendors,
  useMenu,
  useRemoveEventVendor,
  useRemoveMenuItem,
  useUpdateEventVendor,
  useVendors,
} from "@/data/hooks";
import { centsFromInput, centsToInput, formatMoney, sumCents } from "@/data/money";
import { BOOKING_STATUSES, type BookingStatus, type Event } from "@/data/entities";

const COURSES = ["Breakfast", "Starter", "Main", "Dessert", "Lunch", "Canapés", "Drinks", "Other"];

function VendorRow({ eventId, bookingId, ...props }: { eventId: string; bookingId: string } & {
  name: string;
  category: string;
  vendorId: string;
  status: BookingStatus;
  feeCents: number | null;
  notes: string | null;
}) {
  const update = useUpdateEventVendor();
  const remove = useRemoveEventVendor();
  const [fee, setFee] = useState(centsToInput(props.feeCents));

  const commitFee = () => {
    const next = centsFromInput(fee);
    if (next === props.feeCents) return;
    update.mutate(
      { eventId, id: bookingId, patch: { feeCents: next } },
      { onError: (error) => toast({ title: "Couldn't update fee", description: error.message }) },
    );
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/app/vendors/${props.vendorId}`} className="truncate text-sm font-medium text-foreground hover:underline">
            {props.name}
          </Link>
          <Pill>{props.category}</Pill>
        </div>
        {props.notes ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{props.notes}</p> : null}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="sr-only">Fee for {props.name}</span>
        <span aria-hidden="true">$</span>
        <Input
          value={fee}
          onChange={(inputEvent) => setFee(inputEvent.target.value)}
          onBlur={commitFee}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Enter") keyEvent.currentTarget.blur();
          }}
          inputMode="decimal"
          className="h-8 w-28 text-right"
          aria-label={`Fee for ${props.name}`}
        />
      </label>

      <BookingStatusBadge status={props.status} />

      <Select
        value={props.status}
        onValueChange={(value) =>
          update.mutate(
            { eventId, id: bookingId, patch: { status: value as BookingStatus } },
            { onError: (error) => toast({ title: "Couldn't update status", description: error.message }) },
          )
        }
      >
        <SelectTrigger className="h-8 w-[130px]" aria-label={`Booking status for ${props.name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BOOKING_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button asChild variant="outline" size="sm">
        <Link href={`/app/vendors/${props.vendorId}`} aria-label={`Message ${props.name}`}>
          <MessageSquare className="size-3.5" />
        </Link>
      </Button>

      <Button
        variant="outline"
        size="sm"
        aria-label={`Remove ${props.name} from this event`}
        onClick={() =>
          remove.mutate(
            { eventId, id: bookingId },
            { onError: (error) => toast({ title: "Couldn't remove", description: error.message }) },
          )
        }
      >
        <Trash2 className="size-3.5 text-danger-text" />
      </Button>
    </li>
  );
}

function VendorsPanel({ event }: { event: Event }) {
  const { data: bookings, isLoading, isError, error, refetch } = useEventVendors(event.id);
  const { data: directory } = useVendors();
  const addVendor = useAddEventVendor();
  const [vendorId, setVendorId] = useState("");

  const available = useMemo(() => {
    const booked = new Set((bookings ?? []).map((booking) => booking.vendorId));
    return (directory ?? []).filter((vendor) => !booked.has(vendor.id));
  }, [bookings, directory]);

  const committed = sumCents((bookings ?? []).map((booking) => booking.feeCents));
  const confirmed = (bookings ?? []).filter((booking) => booking.status === "confirmed").length;
  const pending = (bookings ?? []).filter((booking) => booking.status === "pending").length;

  return (
    <Panel>
      <PanelHeader
        title="Vendors"
        description={
          bookings?.length
            ? `${confirmed} confirmed, ${pending} pending · ${formatMoney(committed)} committed`
            : "Nobody booked yet"
        }
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (!vendorId) return;
          addVendor.mutate(
            { eventId: event.id, draft: { vendorId } },
            {
              onSuccess: () => setVendorId(""),
              onError: (mutationError) => toast({ title: "Couldn't add vendor", description: mutationError.message }),
            },
          );
        }}
      >
        <Select value={vendorId} onValueChange={setVendorId} disabled={available.length === 0}>
          <SelectTrigger className="min-w-[14rem] flex-1" aria-label="Choose a vendor to book">
            <SelectValue placeholder={available.length === 0 ? "Every vendor is already booked" : "Book a vendor…"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((vendor) => (
              <SelectItem key={vendor.id} value={vendor.id}>
                {vendor.name} · {vendor.category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={!vendorId || addVendor.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Book
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/app/vendors/new">New vendor</Link>
        </Button>
      </form>

      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
      ) : isLoading ? (
        <LoadingRows rows={4} className="p-4" />
      ) : (bookings ?? []).length === 0 ? (
        <EmptyState
          icon={Store}
          title="No vendors on this event"
          description="Book from your directory above. Unconfirmed vendors on a near event show up on Today."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {(bookings ?? []).map((booking) => (
            <VendorRow
              key={booking.id}
              eventId={event.id}
              bookingId={booking.id}
              vendorId={booking.vendorId}
              name={booking.vendor?.name ?? "Removed vendor"}
              category={booking.vendor?.category ?? "—"}
              status={booking.status}
              feeCents={booking.feeCents}
              notes={booking.notes}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MenuPanel({ event }: { event: Event }) {
  const { data: dishes, isLoading } = useMenu(event.id);
  const addDish = useAddMenuItem();
  const removeDish = useRemoveMenuItem();
  const [name, setName] = useState("");
  const [course, setCourse] = useState("Main");

  const grouped = useMemo(() => {
    const map = new Map<string, typeof dishes>();
    for (const dish of dishes ?? []) {
      const bucket = map.get(dish.course);
      if (bucket) bucket.push(dish);
      else map.set(dish.course, [dish]);
    }
    return [...map.entries()];
  }, [dishes]);

  const dietary = useMemo(() => {
    const tags = new Set<string>();
    for (const dish of dishes ?? []) for (const tag of dish.dietaryTags) tags.add(tag);
    return [...tags];
  }, [dishes]);

  return (
    <Panel>
      <PanelHeader
        title="Menu"
        description={dishes?.length ? `${dishes.length} dishes` : "What's being served"}
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          addDish.mutate(
            { eventId: event.id, draft: { name: trimmed, course } },
            {
              onSuccess: () => setName(""),
              onError: (error) => toast({ title: "Couldn't add dish", description: error.message }),
            },
          );
        }}
      >
        <Input
          value={name}
          onChange={(inputEvent) => setName(inputEvent.target.value)}
          placeholder="Add a dish…"
          aria-label="Dish name"
          className="min-w-[10rem] flex-1"
        />
        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger className="w-[132px]" aria-label="Course">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COURSES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={!name.trim() || addDish.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </form>

      {dietary.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3">
          <span className="text-xs font-medium text-muted-foreground">Dietary coverage:</span>
          {dietary.map((tag) => (
            <Pill key={tag} tone="info">
              {tag}
            </Pill>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : grouped.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="No menu yet" description="Add dishes as the caterer confirms them." />
      ) : (
        <div className="divide-y divide-hairline">
          {grouped.map(([courseName, courseDishes]) => (
            <div key={courseName} className="px-5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{courseName}</p>
              <ul className="mt-2 space-y-2">
                {(courseDishes ?? []).map((dish) => (
                  <li key={dish.id} className="group flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{dish.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {dish.dietaryTags.map((tag) => (
                          <Pill key={tag} tone="success">
                            {tag}
                          </Pill>
                        ))}
                        {dish.serves ? (
                          <span data-numeric className="text-xs text-muted-foreground">
                            serves {dish.serves}
                          </span>
                        ) : null}
                      </div>
                      {dish.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{dish.notes}</p> : null}
                    </div>
                    {dish.priceCents !== null ? (
                      <span data-numeric className="shrink-0 text-sm text-muted-foreground">
                        {formatMoney(dish.priceCents)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Remove ${dish.name}`}
                      onClick={() =>
                        removeDish.mutate(
                          { eventId: event.id, id: dish.id },
                          { onError: (error) => toast({ title: "Couldn't remove", description: error.message }) },
                        )
                      }
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function SuppliersSection({ event }: { event: Event }) {
  const { data: bookings } = useEventVendors(event.id);

  const byCategory = useMemo(() => {
    const map = new Map<string, { confirmed: number; total: number }>();
    for (const booking of bookings ?? []) {
      const key = booking.vendor?.category ?? "Other";
      const entry = map.get(key) ?? { confirmed: 0, total: 0 };
      entry.total += 1;
      if (booking.status === "confirmed") entry.confirmed += 1;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [bookings]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-6">
        <VendorsPanel event={event} />
      </div>
      <div className="space-y-6">
        {byCategory.length > 0 ? (
          <Panel>
            <PanelHeader title="Coverage by category" description="Confirmed against booked" />
            <dl className="divide-y divide-hairline px-5 py-2">
              {byCategory.map(([category, entry]) => (
                <KeyValue key={category} label={category}>
                  <span className={entry.confirmed === entry.total ? "text-success-text" : "text-warning-text"}>
                    {entry.confirmed}/{entry.total}
                  </span>
                </KeyValue>
              ))}
            </dl>
          </Panel>
        ) : null}
        <MenuPanel event={event} />
      </div>
    </div>
  );
}
