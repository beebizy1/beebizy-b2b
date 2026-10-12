import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Gavel, Gift, Heart, Search, Share2, SlidersHorizontal, UserRoundPlus, WalletCards } from "lucide-react";
import { PublicFrame } from "./PublicEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LoadingRows, Panel, Pill } from "@/components/primitives";
import {
  useCreateFundraisingPledge,
  useBuyNowAuctionItem,
  usePlaceAuctionBid,
  usePublicAuction,
  usePublicBidderProfile,
  useRegisterAuctionBidder,
  useSetAuctionWatch,
  useSetupBidderWallet,
} from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";

function bidderStorageKey(token: string) {
  return `beebizy:auction:${token}:bidder`;
}

export default function PublicAuctionPage({ token }: { token: string }) {
  const { data: auction, isLoading, refetch } = usePublicAuction(token);
  const register = useRegisterAuctionBidder();
  const bid = usePlaceAuctionBid();
  const setupWallet = useSetupBidderWallet();
  const setWatch = useSetAuctionWatch();
  const pledge = useCreateFundraisingPledge();
  const buyNow = useBuyNowAuctionItem();
  const [bidderToken, setBidderToken] = useState(() => {
    const fromLink = new URLSearchParams(window.location.search).get("bidder") ?? "";
    if (fromLink) {
      localStorage.setItem(bidderStorageKey(token), fromLink);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("bidder");
      window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
    return fromLink || localStorage.getItem(bidderStorageKey(token)) || "";
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [participantType, setParticipantType] = useState<"gala" | "remote">("gala");
  const [grades, setGrades] = useState<string[]>([]);
  const [autoChargeOptIn, setAutoChargeOptIn] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("ending");
  const [filter, setFilter] = useState("all");
  const [myBidsOnly, setMyBidsOnly] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [customGift, setCustomGift] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<Record<string, number>>({});
  const [clockNow, setClockNow] = useState(Date.now());
  const { data: bidderProfile, isLoading: bidderProfileLoading } = usePublicBidderProfile(token, bidderToken || null);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!bidderToken || bidderProfileLoading || bidderProfile !== null) return;
    localStorage.removeItem(bidderStorageKey(token));
    setBidderToken("");
    toast({ title: "Bidder link expired", description: "Register again or use the newest private link from your email." });
  }, [bidderProfile, bidderProfileLoading, bidderToken, token]);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = (auction?.items ?? []).filter((item) =>
      (category === "all" || item.category === category) &&
      (!term || `${item.title} ${item.description ?? ""} ${item.category ?? ""} ${item.creditText ?? ""}`.toLowerCase().includes(term)) &&
      (!myBidsOnly || Boolean(bidderProfile?.winningItemIds.includes(item.id) || bidderProfile?.outbidItemIds.includes(item.id))) &&
      (filter === "all" ||
        (filter === "no-bids" && item.bidCount === 0) ||
        (filter === "ending" && item.closesAt != null && new Date(item.closesAt).getTime() - clockNow <= 15 * 60_000) ||
        (filter === "buy-now" && item.buyNowCents != null) ||
        (filter === "watching" && bidderProfile?.watchedItemIds.includes(item.id)) ||
        (filter === "live" && item.itemType === "live") ||
        (filter === "silent" && item.itemType !== "live")),
    );
    return [...visible].sort((left, right) => {
      if (sort === "bids") return right.bidCount - left.bidCount;
      if (sort === "low") return (left.currentBidCents ?? left.startingBidCents) - (right.currentBidCents ?? right.startingBidCents);
      if (sort === "value") return (right.fairMarketValueCents ?? right.estimatedValueCents ?? 0) - (left.fairMarketValueCents ?? left.estimatedValueCents ?? 0);
      if (sort === "new") return right.id.localeCompare(left.id);
      return (left.closesAt ? new Date(left.closesAt).getTime() : Number.MAX_SAFE_INTEGER) - (right.closesAt ? new Date(right.closesAt).getTime() : Number.MAX_SAFE_INTEGER);
    });
  }, [auction?.items, bidderProfile, category, clockNow, filter, myBidsOnly, search, sort]);

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
          {auction.settings.closesAt ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#ffd700]"><Clock3 className="size-4" />Silent auction closes in {Math.max(0, Math.ceil((new Date(auction.settings.closesAt).getTime() - clockNow) / 60_000))} minutes</p>
          ) : null}
          {auction.donationToken ? <Button className="mt-5 border-white bg-white text-[#17130a] hover:bg-white/90 hover:text-[#17130a]" variant="outline" onClick={() => window.location.assign(`/give/${auction.donationToken}`)}><Gift className="mr-1.5 size-4" />Make a donation</Button> : null}
        </section>
        {(auction.announcements ?? []).map((announcement) => <div key={announcement.id} className="rounded-xl border border-primary/25 bg-primary-muted px-4 py-3 text-sm font-medium text-foreground">{announcement.message}</div>)}

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
                  register.mutate({ token, draft: { name, email, phone, participantType, grades, autoChargeOptIn } }, {
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
                <div className="space-y-2 sm:col-span-2"><Label>Family grade(s)</Label><div className="flex flex-wrap gap-2">{["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Alumni", "Faculty/Staff", "Friend of school"].map((grade) => <label key={grade} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${grades.includes(grade) ? "border-primary bg-primary-muted font-semibold" : "border-hairline"}`}><input type="checkbox" className="sr-only" checked={grades.includes(grade)} onChange={() => setGrades((current) => current.includes(grade) ? current.filter((item) => item !== grade) : [...current, grade])} />{grade}</label>)}</div></div>
                <label className="flex items-start gap-2 text-sm text-muted-foreground sm:col-span-2"><input type="checkbox" checked={autoChargeOptIn} onChange={(event) => setAutoChargeOptIn(event.target.checked)} className="mt-1" /><span>Charge my saved card automatically for winning bids and gifts. My card will not be charged unless I win or give.</span></label>
                <div className="sm:col-span-2"><Button type="submit" disabled={!name.trim() || !email.trim() || phone.replace(/\D/g, "").length < 10 || register.isPending}>{register.isPending ? "Registering..." : "Register to bid"}</Button></div>
              </form>
            ) : <p className="mt-4 text-sm text-muted-foreground">Bidder registration is closed.</p>}
          </Panel>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/20 bg-success-tint px-4 py-3 text-sm text-success-text">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <span className="font-semibold">Paddle {bidderProfile?.paddleNumber ?? "assigned"}</span>
            <span className="min-w-0 flex-1">{bidderProfile?.hasPaymentMethod ? "You're ready to bid." : "Add a card or wallet before your first bid."}</span>
            {!bidderProfile?.hasPaymentMethod ? <Button size="sm" disabled={setupWallet.isPending} onClick={() => setupWallet.mutate({ token, bidderToken }, { onSuccess: (result) => window.location.assign(result.url), onError: (error) => toast({ title: "Couldn't open wallet setup", description: error.message }) })}><WalletCards className="mr-1.5 size-4" />{setupWallet.isPending ? "Opening..." : "Add card or wallet"}</Button> : null}
            <Button size="sm" variant={myBidsOnly ? "default" : "outline"} onClick={() => setMyBidsOnly((value) => !value)}>My bids {(bidderProfile?.outbidItemIds.length ?? 0) > 0 ? `(${bidderProfile?.outbidItemIds.length} outbid)` : ""}</Button>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button size="sm" variant={category === "all" ? "default" : "outline"} onClick={() => setCategory("all")}>All</Button>
          {auction.categories.map((itemCategory) => <Button key={itemCategory} size="sm" variant={category === itemCategory ? "default" : "outline"} className="shrink-0" onClick={() => setCategory(itemCategory)}>{itemCategory}</Button>)}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[15rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search auction items" className="pl-9" />
          </div>
          <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3"><SlidersHorizontal className="size-4 text-muted-foreground" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-9 bg-transparent text-sm outline-none"><option value="all">All items</option><option value="silent">Silent auction</option><option value="live">Live auction</option><option value="no-bids">No bids yet</option><option value="ending">Ending soon</option><option value="buy-now">Buy it now</option><option value="watching">Items I'm watching</option></select></label>
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="ending">Ending soon</option><option value="bids">Most bids</option><option value="low">Lowest current bid</option><option value="value">Highest value</option><option value="new">Newest</option></select>
        </div>

        {items.length === 0 ? (
          <Panel><EmptyState icon={Gavel} title="No auction items to show" description={auction.settings.catalogPublished ? "Try another search or category." : "The organizer has not published the catalog yet."} /></Panel>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {items.map((item) => {
              const minimum = item.currentBidCents === null ? item.startingBidCents : item.currentBidCents + item.bidIncrementCents;
              const now = clockNow;
              const opensAt = item.opensAt ? new Date(item.opensAt).getTime() : null;
              const closesAt = item.closesAt ? new Date(item.closesAt).getTime() : null;
              const biddingOpen = item.status === "open" && (opensAt === null || now >= opensAt) && (closesAt === null || now < closesAt);
              const winning = bidderProfile?.winningItemIds.includes(item.id) ?? false;
              const outbid = bidderProfile?.outbidItemIds.includes(item.id) ?? false;
              const watched = bidderProfile?.watchedItemIds.includes(item.id) ?? false;
              const photos = item.photoUrls?.length ? item.photoUrls : item.imageUrl ? [item.imageUrl] : [];
              const selectedPhoto = Math.min(selectedPhotos[item.id] ?? 0, Math.max(0, photos.length - 1));
              const place = (cents: number) => bid.mutate({ token, bidderToken, itemId: item.id, maximumAmountCents: cents }, {
                onSuccess: (result) => {
                  setAmounts((current) => ({ ...current, [item.id]: "" }));
                  toast({ title: result.bidderIsLeading ? "You are the leading bidder" : "Bid saved", description: `Current bid: ${formatMoney(result.item.currentBidCents)}` });
                  void refetch();
                },
                onError: (error) => toast({ title: "Bid was not placed", description: error.message }),
              });
              return (
                <article id={`item-${item.id}`} key={item.id} className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-sm">
                  <div className="relative">{photos[selectedPhoto] ? <img src={photos[selectedPhoto]} alt={`${item.title}, photo ${selectedPhoto + 1} of ${photos.length}`} className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-surface-sunken"><Gavel className="size-10 text-muted-foreground" /></div>}<div className="absolute right-3 top-3 flex gap-2">{bidderToken ? <button type="button" aria-label={watched ? `Stop watching ${item.title}` : `Watch ${item.title}`} onClick={() => setWatch.mutate({ token, bidderToken, itemId: item.id, watched: !watched })} className={`grid size-10 place-items-center rounded-full bg-white/95 shadow ${watched ? "text-danger-text" : "text-muted-foreground"}`}><Heart className="size-5" fill={watched ? "currentColor" : "none"} /></button> : null}<button type="button" aria-label={`Share ${item.title}`} onClick={() => { const url = `${window.location.origin}/auction/${token}#item-${item.id}`; if (navigator.share) void navigator.share({ title: item.title, url }); else void navigator.clipboard.writeText(url).then(() => toast({ title: "Item link copied" })); }} className="grid size-10 place-items-center rounded-full bg-white/95 text-muted-foreground shadow"><Share2 className="size-5" /></button></div>{photos.length > 1 ? <div className="absolute bottom-3 left-3 flex gap-1.5">{photos.map((_, index) => <button key={index} type="button" aria-label={`Show photo ${index + 1}`} onClick={() => setSelectedPhotos((current) => ({ ...current, [item.id]: index }))} className={`size-2.5 rounded-full border border-white ${index === selectedPhoto ? "bg-white" : "bg-black/40"}`} />)}</div> : null}</div>
                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><h2 className="font-semibold text-foreground">{item.title}</h2>{item.category ? <p className="text-xs text-muted-foreground">{item.category}</p> : null}</div>
                      <div className="flex flex-col items-end gap-1">{item.lotNumber ? <Pill>Lot {item.lotNumber}</Pill> : null}{winning ? <Pill tone="success">You're winning</Pill> : outbid ? <Pill tone="danger">Outbid</Pill> : item.bidCount === 0 ? <Pill>No bids yet</Pill> : null}</div>
                    </div>
                    {item.creditText ? <p className="text-xs text-muted-foreground">Donated by {item.creditText}</p> : null}
                    {item.description ? <p className="text-sm leading-6 text-muted-foreground">{item.description}</p> : null}
                    {item.restrictions ? <p className="rounded-lg bg-surface-sunken p-3 text-xs text-muted-foreground"><strong>Restrictions:</strong> {item.restrictions}</p> : null}
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs text-muted-foreground">Current bid</dt><dd className="font-semibold">{formatMoney(item.currentBidCents ?? item.startingBidCents)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Fair market value</dt><dd className="font-semibold">{item.fairMarketValueCents == null ? "Not listed" : formatMoney(item.fairMarketValueCents)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Bids</dt><dd className="font-semibold">{item.bidCount}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Minimum next bid</dt><dd className="font-semibold">{formatMoney(minimum)}</dd></div>
                    </dl>
                    {(item.bidHistory?.length ?? 0) > 0 ? <details className="rounded-lg border border-hairline p-3"><summary className="cursor-pointer text-sm font-semibold">Bid history</summary><ul className="mt-2 divide-y divide-hairline">{item.bidHistory!.map((history, index) => <li key={`${history.placedAt}-${index}`} className="flex items-center justify-between gap-3 py-2 text-xs"><span>{history.bidderLabel}</span><span className="text-muted-foreground">{formatMoney(history.amountCents)} · {new Date(history.placedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></li>)}</ul></details> : null}
                    {closesAt ? <p className="text-xs font-medium text-muted-foreground">{closesAt > now ? `${Math.ceil((closesAt - now) / 60_000)} minutes left` : "Closed"}{item.extensionMinutes ? ` · Extended +${item.extensionMinutes} min` : ""}</p> : null}
                    {biddingOpen && bidderToken && bidderProfile?.hasPaymentMethod && item.buyNowCents ? <Button className="w-full" variant="outline" disabled={buyNow.isPending} onClick={() => buyNow.mutate({ token, bidderToken, itemId: item.id }, { onSuccess: (result) => toast({ title: `You bought ${item.title}`, description: `${formatMoney(result.amountCents)} was added to your event bill.` }), onError: (error) => toast({ title: "Buy it now failed", description: error.message }) })}>Buy now for {formatMoney(item.buyNowCents)}</Button> : null}
                    {biddingOpen && bidderToken && bidderProfile?.hasPaymentMethod ? (
                      <div className="space-y-2">
                        <Button className="w-full" disabled={bid.isPending} onClick={() => place(minimum)}>Bid {formatMoney(minimum)}</Button>
                      {item.itemType !== "live" ? <form
                        className="flex gap-2"
                        onSubmit={(formEvent) => {
                          formEvent.preventDefault();
                          const cents = Math.round(Number(amounts[item.id]) * 100);
                          if (!Number.isInteger(cents) || cents < minimum) {
                            toast({ title: "Bid is too low", description: `The minimum next bid is ${formatMoney(minimum)}.` });
                            return;
                          }
                          place(cents);
                        }}
                      >
                        <Input type="number" min={minimum / 100} step="0.01" value={amounts[item.id] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={`$${(minimum / 100).toFixed(2)}`} aria-label={`Bid on ${item.title}`} />
                        <Button type="submit" variant="outline" disabled={bid.isPending}>Set max bid</Button>
                      </form> : <p className="text-xs text-muted-foreground">Remote live bids are sent to the auctioneer. The room console is the source of truth for the winner.</p>}
                      {item.itemType !== "live" ? <p className="text-xs text-muted-foreground">We'll bid the minimum needed to keep you winning, up to your max. Others never see it.</p> : null}
                      </div>
                    ) : biddingOpen && bidderToken && !bidderProfile?.hasPaymentMethod ? (
                      <Button className="w-full" variant="outline" onClick={() => setupWallet.mutate({ token, bidderToken }, { onSuccess: (result) => window.location.assign(result.url) })}>Add card or wallet to bid</Button>
                    ) : !biddingOpen ? (
                      <Pill tone="warning">{opensAt !== null && now < opensAt ? "Bidding has not opened" : "Bidding closed"}</Pill>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {bidderToken ? (
          <Panel className="p-6">
            <div className="flex flex-wrap items-start gap-4"><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Fund-a-Need</p><h2 className="mt-1 text-xl font-bold">Raise your paddle from anywhere</h2><p className="mt-1 text-sm text-muted-foreground">Gifts are added to your single event bill. No goods or services are provided.</p></div><div className="flex flex-wrap gap-2">{[100_00, 250_00, 500_00, 1_000_00].map((amount) => <Button key={amount} variant="outline" disabled={pledge.isPending || !bidderProfile?.hasPaymentMethod} onClick={() => pledge.mutate({ token, bidderToken, amountCents: amount, channel: bidderProfile?.checkedInAt ? "in_room" : "remote" }, { onSuccess: () => toast({ title: `${formatMoney(amount)} pledge recorded` }), onError: (error) => toast({ title: "Couldn't record pledge", description: error.message }) })}>{formatMoney(amount)}</Button>)}</div></div>
            <form className="mt-4 flex max-w-sm gap-2" onSubmit={(event) => { event.preventDefault(); const cents = Math.round(Number(customGift) * 100); if (cents < 100) return; pledge.mutate({ token, bidderToken, amountCents: cents, channel: bidderProfile?.checkedInAt ? "in_room" : "remote" }, { onSuccess: () => { setCustomGift(""); toast({ title: `${formatMoney(cents)} pledge recorded` }); }, onError: (error) => toast({ title: "Couldn't record pledge", description: error.message }) }); }}><Input type="number" min="1" step="0.01" value={customGift} onChange={(event) => setCustomGift(event.target.value)} placeholder="Custom amount" /><Button type="submit" disabled={!bidderProfile?.hasPaymentMethod || pledge.isPending}>Give</Button></form>
          </Panel>
        ) : null}
      </div>
    </PublicFrame>
  );
}
