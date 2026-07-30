import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useBuyPageData, checkoutTickets, type ConfirmationData } from "@/lib/firestore/public-buy";
import { format } from "date-fns";
import { MapPin, Clock, Ticket, CheckCircle2, Minus, Plus, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type Step = "select" | "info" | "confirmed";

export default function BuyTicketsPage() {
  const [, params] = useRoute("/buy/:token");
  const token = params?.token ?? "";

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [step, setStep] = useState<Step>("select");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { data, isLoading, isError } = useBuyPageData(token);

  const checkout = useMutation({
    mutationFn: async () => {
      const items = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
      return checkoutTickets({ token, buyerName, buyerEmail, buyerPhone: buyerPhone || undefined, items });
    },
    onSuccess: (data) => { setConfirmation(data); setStep("confirmed"); },
    onError: (e: Error) => setApiError(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-2xl mx-auto p-8 space-y-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <img src="/beebizy-logo.png" alt="Beebizy" className="h-10 w-auto opacity-60" />
        <h1 className="text-xl font-semibold">Link not found</h1>
        <p className="text-muted-foreground text-sm">This ticket link may have expired or been removed.</p>
      </div>
    );
  }

  const { event, ticketTypes } = data;
  const selectedCount = Object.values(quantities).reduce((s, q) => s + q, 0);
  const selectedTotal = (ticketTypes ?? []).reduce((s, t) => s + parseFloat(t.price) * (quantities[t.id] ?? 0), 0);

  function setQty(id: string, delta: number, max: number) {
    setQuantities(prev => {
      const cur = prev[id] ?? 0;
      const next = Math.max(0, Math.min(cur + delta, max));
      return { ...prev, [id]: next };
    });
  }

  if (step === "confirmed" && confirmation) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto p-8 space-y-8">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold">You're in!</h1>
            <p className="text-muted-foreground text-sm">
              Confirmation sent to <span className="font-medium text-foreground">{confirmation.buyerEmail}</span>
            </p>
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="bg-primary/5 border-b px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">{confirmation.event.title}</div>
                {confirmation.event.date && (
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(confirmation.event.date), "PPP")}
                  </div>
                )}
                {confirmation.event.location && (
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {confirmation.event.location}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Confirmation</div>
                <div className="font-mono font-bold text-lg">#{confirmation.confirmationId}</div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Order Summary</div>
              {confirmation.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.name} <span className="text-muted-foreground">x{item.quantity}</span></span>
                  <span className="font-medium">{fmt(item.subtotal)}</span>
                </div>
              ))}
              <div className="pt-3 border-t flex justify-between font-bold">
                <span>Total</span>
                <span>{fmt(confirmation.total)}</span>
              </div>
            </div>

            <div className="bg-muted/30 border-t px-5 py-4">
              <div className="text-xs text-muted-foreground">Registered for</div>
              <div className="font-medium text-sm mt-0.5">{confirmation.buyerName}</div>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Powered by <a href="/" className="font-medium text-foreground hover:underline">Beebizy</a> — Professional Event Management
          </p>
        </div>
      </div>
    );
  }

  if (step === "info") {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail);
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto p-8 space-y-8">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => { setStep("select"); setApiError(null); }}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to tickets
          </button>

          <div>
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">Complete your registration below.</p>
          </div>

          {/* Order preview */}
          <div className="bg-muted/30 border rounded-xl px-5 py-4 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Your order</div>
            {ticketTypes.filter(t => (quantities[t.id] ?? 0) > 0).map(t => (
              <div key={t.id} className="flex justify-between text-sm">
                <span>{t.name} <span className="text-muted-foreground">x{quantities[t.id]}</span></span>
                <span>{fmt(parseFloat(t.price) * (quantities[t.id] ?? 0))}</span>
              </div>
            ))}
            <div className="pt-2 border-t flex justify-between font-bold text-sm">
              <span>Total</span>
              <span>{fmt(selectedTotal)}</span>
            </div>
          </div>

          {/* Buyer info form */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Full name *</label>
              <Input placeholder="Jane Smith" value={buyerName} onChange={e => setBuyerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email *</label>
              <Input placeholder="jane@example.com" type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input placeholder="+1 (555) 000-0000" type="tel" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} />
            </div>
          </div>

          {apiError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
              {apiError}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!buyerName.trim() || !emailOk || checkout.isPending}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending ? "Processing..." : `Complete Registration · ${fmt(selectedTotal)}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By completing registration you agree to the event organizer's terms.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-2xl mx-auto p-8 space-y-8">
        {/* Event header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            {event.date && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {format(new Date(event.date), "PPP")}
                {event.endDate && <> — {format(new Date(event.endDate), "PPP")}</>}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {event.location}
              </span>
            )}
          </div>
          {event.description && (
            <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{event.description}</p>
          )}
        </div>

        {/* Ticket types */}
        <div className="space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Ticket className="w-4 h-4 text-primary" /> Tickets
          </h2>
          {ticketTypes.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed">
              <p className="text-sm text-muted-foreground">No tickets available at this time.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ticketTypes.map(t => {
                const remaining = t.quantityTotal > 0 ? t.quantityTotal - t.quantitySold : Infinity;
                const soldOut = remaining <= 0;
                const qty = quantities[t.id] ?? 0;
                return (
                  <div key={t.id} className={`bg-card border rounded-xl p-5 flex items-center gap-4 ${soldOut ? "opacity-60" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{t.name}</div>
                      {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-lg font-bold text-primary">{fmt(parseFloat(t.price))}</span>
                        {soldOut ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Sold out</span>
                        ) : t.quantityTotal > 0 && remaining < 20 ? (
                          <span className="text-xs text-amber-600 font-medium">{remaining} left</span>
                        ) : null}
                      </div>
                    </div>
                    {!soldOut && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="icon" className="w-8 h-8 rounded-full" disabled={qty === 0}
                          onClick={() => setQty(t.id, -1, remaining === Infinity ? 99 : remaining)}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-6 text-center font-semibold text-sm">{qty}</span>
                        <Button variant="outline" size="icon" className="w-8 h-8 rounded-full" disabled={qty >= (remaining === Infinity ? 99 : remaining)}
                          onClick={() => setQty(t.id, 1, remaining === Infinity ? 99 : remaining)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky checkout bar */}
        {selectedCount > 0 && (
          <div className="sticky bottom-6">
            <div className="bg-foreground text-background rounded-2xl px-6 py-4 flex items-center justify-between shadow-lg">
              <div>
                <div className="font-semibold">{selectedCount} ticket{selectedCount !== 1 ? "s" : ""} selected</div>
                <div className="text-sm opacity-70">{fmt(selectedTotal)}</div>
              </div>
              <Button variant="secondary" size="lg" className="gap-2 font-semibold" onClick={() => setStep("info")}>
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by <a href="/" className="font-medium text-foreground hover:underline">Beebizy</a> — Professional Event Management
        </p>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="border-b border-border bg-white px-6 py-4 flex items-center gap-3">
      <img src="/beebizy-logo.png" alt="Beebizy" className="h-8 w-auto object-contain object-left" />
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest border-l border-border pl-3">
        Event Tickets
      </span>
    </div>
  );
}
