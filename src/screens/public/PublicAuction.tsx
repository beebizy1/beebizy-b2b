import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Gavel, Search, UserRoundPlus } from "lucide-react";
import { PublicFrame } from "./PublicEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LoadingRows, Panel, Pill } from "@/components/primitives";
import { usePlaceAuctionBid, usePublicAuction, useRegisterAuctionBidder } from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";

function bidderStorageKey(token: string) {
  return `beebizy:auction:${token}:bidder`;
}

export default function PublicAuctionPage({ token }: { token: string }) {
  const { data: auction, isLoading, refetch } = usePublicAuction(token);
  const register = useRegisterAuctionBidder();
  const bid = usePlaceAuctionBid();
  const [bidderToken, setBidderToken] = useState(() => localStorage.getItem(bidderStorageKey(token)) ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [participantType, setParticipantType] = useState<"gala" | "remote">("gala");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (auction?.items ?? []).filter((item) =>
      (category === "all" || item.category === category) &&
      (!term || `${item.title} ${item.description ?? ""} ${item.category ?? ""}`.toLowerCase().includes(term)),
    );
  }, [auction?.items, category, search]);

  if (isLoading) return <PublicFrame><LoadingRows rows={5} /></PublicFrame>;
  if (!auction) {
    return <PublicFrame><Panel><EmptyState icon={Gavel} title="This auction is not active" description="Ask the organizer for the current auction link." /></Panel></PublicFrame>;
  }

  return (
    <PublicFrame>
      <div className="space-y-6">
        <section className="rounded-3xl bg-[#17130a] px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ffd700]">Beebizy auction</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{auction.settings.title || auction.eventTitle}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">{auction.settings.welcomeMessage}</p>
          <p className="mt-5 flex items-center gap-2 text-sm text-white/75">
            <CalendarDays className="size-4" aria-hidden="true" />
            {new Date(auction.eventDate).toLocaleDateString(undefined, { dateStyle: "long" })}
          </p>
        </section>

        {!bidderToken ? (
          <Panel className="p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary-muted text-primary"><UserRoundPlus className="size-5" /></span>
              <div><h2 className="font-semibold text-foreground">Register to bid</h2><p className="text-sm text-muted-foreground">One quick registration works for every item in this auction.</p></div>
            </div>
            {auction.settings.registrationOpen ? (
              <form
                className="mt-5 grid gap-4 sm:grid-cols-2"
                onSubmit={(formEvent) => {
                  formEvent.preventDefault();
                  register.mutate({ token, draft: { name, email, phone: phone || null, participantType } }, {
                    onSuccess: (bidder) => {
                      localStorage.setItem(bidderStorageKey(token), bidder.publicToken);
                      setBidderToken(bidder.publicToken);
                      toast({ title: "You're ready to bid" });
                    },
                    onError: (error) => toast({ title: "Couldn't register", description: error.message }),
                  });
                }}
              >
                <div className="space-y-1.5"><Label htmlFor="auction-name">Full name</Label><Input id="auction-name" value={name} onChange={(event) => setName(event.target.value)} required /></div>
                <div className="space-y-1.5"><Label htmlFor="auction-email">Email</Label><Input id="auction-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
                <div className="space-y-1.5"><Label htmlFor="auction-phone">Mobile phone</Label><Input id="auction-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label htmlFor="auction-participation">How are you joining?</Label>
                  <select id="auction-participation" value={participantType} onChange={(event) => setParticipantType(event.target.value as "gala" | "remote")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="gala">At the gala</option>
                    {auction.settings.allowRemoteBidders ? <option value="remote">Bidding remotely</option> : null}
                  </select>
                </div>
                <div className="sm:col-span-2"><Button type="submit" disabled={!name.trim() || !email.trim() || register.isPending}>{register.isPending ? "Registering…" : "Register to bid"}</Button></div>
              </form>
            ) : <p className="mt-4 text-sm text-muted-foreground">Bidder registration is closed.</p>}
          </Panel>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success-tint px-4 py-3 text-sm text-success-text">
            <CheckCircle2 className="size-4" aria-hidden="true" /> You are registered and can bid on any open item.
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[15rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search auction items" className="pl-9" />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All categories</option>
            {auction.categories.map((itemCategory) => <option key={itemCategory} value={itemCategory}>{itemCategory}</option>)}
          </select>
        </div>

        {items.length === 0 ? (
          <Panel><EmptyState icon={Gavel} title="No auction items to show" description={auction.settings.catalogPublished ? "Try another search or category." : "The organizer has not published the catalog yet."} /></Panel>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {items.map((item) => {
              const minimum = item.currentBidCents === null ? item.startingBidCents : item.currentBidCents + item.bidIncrementCents;
              const now = Date.now();
              const opensAt = item.opensAt ? new Date(item.opensAt).getTime() : null;
              const closesAt = item.closesAt ? new Date(item.closesAt).getTime() : null;
              const biddingOpen = item.status === "open" && (opensAt === null || now >= opensAt) && (closesAt === null || now < closesAt);
              return (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-sm">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-surface-sunken"><Gavel className="size-10 text-muted-foreground" /></div>}
                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><h2 className="font-semibold text-foreground">{item.title}</h2>{item.category ? <p className="text-xs text-muted-foreground">{item.category}</p> : null}</div>
                      {item.lotNumber ? <Pill>Lot {item.lotNumber}</Pill> : null}
                    </div>
                    {item.description ? <p className="text-sm leading-6 text-muted-foreground">{item.description}</p> : null}
                    {item.restrictions ? <p className="rounded-lg bg-surface-sunken p-3 text-xs text-muted-foreground"><strong>Restrictions:</strong> {item.restrictions}</p> : null}
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs text-muted-foreground">Current bid</dt><dd className="font-semibold">{formatMoney(item.currentBidCents ?? item.startingBidCents)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Fair market value</dt><dd className="font-semibold">{item.fairMarketValueCents == null ? "Not listed" : formatMoney(item.fairMarketValueCents)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Bids</dt><dd className="font-semibold">{item.bidCount}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Minimum next bid</dt><dd className="font-semibold">{formatMoney(minimum)}</dd></div>
                    </dl>
                    {biddingOpen && bidderToken ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(formEvent) => {
                          formEvent.preventDefault();
                          const cents = Math.round(Number(amounts[item.id]) * 100);
                          if (!Number.isInteger(cents) || cents < minimum) {
                            toast({ title: "Bid is too low", description: `The minimum next bid is ${formatMoney(minimum)}.` });
                            return;
                          }
                          bid.mutate({ token, bidderToken, itemId: item.id, maximumAmountCents: cents }, {
                            onSuccess: (result) => {
                              setAmounts((current) => ({ ...current, [item.id]: "" }));
                              toast({ title: result.bidderIsLeading ? "You are the leading bidder" : "Bid saved", description: `Current bid: ${formatMoney(result.item.currentBidCents)}` });
                              void refetch();
                            },
                            onError: (error) => toast({ title: "Bid was not placed", description: error.message }),
                          });
                        }}
                      >
                        <Input type="number" min={minimum / 100} step="0.01" value={amounts[item.id] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={`$${(minimum / 100).toFixed(2)}`} aria-label={`Bid on ${item.title}`} />
                        <Button type="submit" disabled={bid.isPending}>Place bid</Button>
                      </form>
                    ) : !biddingOpen ? (
                      <Pill tone="warning">{opensAt !== null && now < opensAt ? "Bidding has not opened" : "Bidding closed"}</Pill>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PublicFrame>
  );
}
