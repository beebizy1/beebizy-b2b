import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Eye, Gavel, Gift, Heart, ReceiptText, Search, Share2, SlidersHorizontal, X } from "lucide-react";
import QRCode from "qrcode";
import { PublicFrame } from "./PublicEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, LoadingRows, Panel, Pill } from "@/components/primitives";
import {
  useCreateFundraisingPledge,
  useBuyNowAuctionItem,
  usePlaceAuctionBid,
  usePublicAuction,
  usePublicBidderProfile,
  useRecoverAuctionBidder,
  useRegisterAuctionBidder,
  useSetAuctionWatch,
  useSetupBidderWallet,
} from "@/data/hooks";
import { formatMoney } from "@/data/money";
import { toast } from "@/hooks/use-toast";
import BidderSetupSheet from "./BidderSetupSheet";
import { bidderPaymentReady } from "@/data/auctionPayments";

function bidderStorageKey(token: string) {
  return `beebizy:auction:${token}:bidder`;
}

export default function PublicAuctionPage({ token }: { token: string }) {
  const { data: auction, isLoading, refetch } = usePublicAuction(token);
  const register = useRegisterAuctionBidder();
  const recoverBidder = useRecoverAuctionBidder();
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
  const [bidderSheetOpen, setBidderSheetOpen] = useState(false);
  const [bidIntentItemId, setBidIntentItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("ending");
  const [filter, setFilter] = useState("all");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [myBidsOnly, setMyBidsOnly] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [customGift, setCustomGift] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<Record<string, number>>({});
  const [clockNow, setClockNow] = useState(Date.now());
  const [mobileTab, setMobileTab] = useState<"auction" | "watching" | "mine" | "give">("auction");
  const [showPaddle, setShowPaddle] = useState(false);
  const [paddleQr, setPaddleQr] = useState("");
  const { data: bidderProfile, isLoading: bidderProfileLoading } = usePublicBidderProfile(token, bidderToken || null);

  const openBidderSetup = (itemId: string | null = null) => {
    setBidIntentItemId(itemId);
    setBidderSheetOpen(true);
  };

  const returnToBidIntent = () => {
    setBidderSheetOpen(false);
    if (!bidIntentItemId) return;
    window.requestAnimationFrame(() => document.getElementById(`item-${bidIntentItemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

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

  useEffect(() => {
    if (!bidderToken || !bidderProfile) { setPaddleQr(""); return; }
    const privateUrl = `${window.location.origin}/auction/${token}?bidder=${encodeURIComponent(bidderToken)}`;
    void QRCode.toDataURL(privateUrl, { width: 320, margin: 1, color: { dark: "#17130a", light: "#ffffff" } }).then(setPaddleQr);
  }, [bidderProfile, bidderToken, token]);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const minCents = minimumPrice.trim() ? Number(minimumPrice) * 100 : null;
    const maxCents = maximumPrice.trim() ? Number(maximumPrice) * 100 : null;
    const visible = (auction?.items ?? []).filter((item) =>
      (category === "all" || item.category === category) &&
      (!term || `${item.title} ${item.description ?? ""} ${item.category ?? ""} ${item.creditText ?? ""}`.toLowerCase().includes(term)) &&
      (!(myBidsOnly || mobileTab === "mine") || Boolean(bidderProfile?.winningItemIds.includes(item.id) || bidderProfile?.outbidItemIds.includes(item.id))) &&
      (minCents == null || (item.currentBidCents ?? item.startingBidCents) >= minCents) &&
      (maxCents == null || (item.currentBidCents ?? item.startingBidCents) <= maxCents) &&
      (filter === "all" ||
        (filter === "no-bids" && item.bidCount === 0) ||
        (filter === "ending" && item.closesAt != null && new Date(item.closesAt).getTime() - clockNow <= 15 * 60_000) ||
        (filter === "buy-now" && item.buyNowCents != null) ||
        ((filter === "watching" || mobileTab === "watching") && bidderProfile?.watchedItemIds.includes(item.id)) ||
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
  }, [auction?.items, bidderProfile, category, clockNow, filter, maximumPrice, minimumPrice, mobileTab, myBidsOnly, search, sort]);

  if (isLoading) return <PublicFrame><LoadingRows rows={5} /></PublicFrame>;
  if (!auction) {
    return <PublicFrame><Panel><EmptyState icon={Gavel} title="This auction is not active" description="Ask the organizer for the current auction link." /></Panel></PublicFrame>;
  }
  const paymentReady = bidderPaymentReady(auction.paymentMode, bidderProfile?.hasPaymentMethod === true);

  return (
    <PublicFrame>
      <div className="space-y-6 pb-24 sm:pb-0">
        <section className="rounded-3xl border border-primary/20 bg-primary-muted/35 px-6 py-7 text-foreground sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Beebizy auction</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{auction.settings.title || auction.eventTitle}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{auction.settings.welcomeMessage}</p>
          {!bidderToken ? <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-foreground">Browse first. Register only when you bid. Getting a private bidder number takes about 30 seconds.</p> : null}
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            {new Date(auction.eventDate).toLocaleDateString(undefined, { dateStyle: "long" })}
          </p>
          {auction.settings.closesAt ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary-text"><Clock3 className="size-4" />Silent auction closes in {Math.max(0, Math.ceil((new Date(auction.settings.closesAt).getTime() - clockNow) / 60_000))} minutes</p>
          ) : null}
          {auction.donationToken ? <Button className="mt-5" variant="outline" onClick={() => window.location.assign(`/give/${auction.donationToken}`)}><Gift className="mr-1.5 size-4" />Make a donation</Button> : null}
        </section>
        {(auction.announcements ?? []).map((announcement) => <div key={announcement.id} className="rounded-xl border border-primary/25 bg-primary-muted px-4 py-3 text-sm font-medium text-foreground">{announcement.message}</div>)}

        {bidderToken ? (
          <div className="grid gap-3 rounded-xl border border-success/20 bg-success-tint px-4 py-3 text-sm text-success-text sm:flex sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-3 sm:contents">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <button type="button" className="rounded-lg bg-primary px-3 py-2 font-black text-primary-foreground shadow-sm" onClick={() => setShowPaddle(true)}>Paddle {bidderProfile?.paddleNumber ?? "assigned"}</button>
            </div>
            <span className="min-w-0 leading-5 sm:flex-1">{paymentReady ? auction.paymentMode === "pay_later" ? "You're ready to bid. Payment is collected after the auction." : "You're ready to bid." : "Browse freely. We’ll ask for secure payment when you place a bid."}</span>
            <Button className="w-full sm:w-auto" size="sm" variant={myBidsOnly ? "default" : "outline"} onClick={() => setMyBidsOnly((value) => !value)}>My bids {(bidderProfile?.outbidItemIds.length ?? 0) > 0 ? `(${bidderProfile?.outbidItemIds.length} outbid)` : ""}</Button>
          </div>
        ) : null}

        {mobileTab !== "give" ? <><div className="flex gap-2 overflow-x-auto pb-1">
          <Button size="sm" variant={category === "all" ? "default" : "outline"} onClick={() => setCategory("all")}>All</Button>
          {auction.categories.map((itemCategory) => <Button key={itemCategory} size="sm" variant={category === itemCategory ? "default" : "outline"} className="shrink-0" onClick={() => setCategory(itemCategory)}>{itemCategory}</Button>)}
        </div>
        <div className="space-y-3">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search auction items" className="pl-9" />
          </div>
          <details className="rounded-xl border border-hairline bg-background sm:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold"><SlidersHorizontal className="size-4 text-primary" />Filters and sort</summary>
            <div className="grid gap-3 border-t border-hairline p-4">
              <select aria-label="Filter auction items" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All items</option><option value="silent">Silent auction</option><option value="live">Live auction</option><option value="no-bids">No bids yet</option><option value="ending">Ending soon</option><option value="buy-now">Buy it now</option><option value="watching">Items I'm watching</option></select>
              <select aria-label="Sort auction items" value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="ending">Ending soon</option><option value="bids">Most bids</option><option value="low">Lowest current bid</option><option value="value">Highest value</option><option value="new">Newest</option></select>
              <div className="flex items-center gap-2"><Input className="min-w-0 flex-1" inputMode="decimal" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} placeholder="Min $" aria-label="Minimum current bid" /><span className="text-muted-foreground">to</span><Input className="min-w-0 flex-1" inputMode="decimal" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} placeholder="Max $" aria-label="Maximum current bid" /></div>
            </div>
          </details>
          <div className="hidden flex-wrap gap-3 sm:flex">
            <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3"><SlidersHorizontal className="size-4 text-muted-foreground" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-9 bg-transparent text-sm outline-none"><option value="all">All items</option><option value="silent">Silent auction</option><option value="live">Live auction</option><option value="no-bids">No bids yet</option><option value="ending">Ending soon</option><option value="buy-now">Buy it now</option><option value="watching">Items I'm watching</option></select></label>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="ending">Ending soon</option><option value="bids">Most bids</option><option value="low">Lowest current bid</option><option value="value">Highest value</option><option value="new">Newest</option></select>
            <div className="flex items-center gap-2"><Input className="w-28" inputMode="decimal" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} placeholder="Min $" aria-label="Minimum current bid" /><span className="text-muted-foreground">to</span><Input className="w-28" inputMode="decimal" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} placeholder="Max $" aria-label="Maximum current bid" /></div>
          </div>
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
                    {biddingOpen && bidderToken && paymentReady && item.buyNowCents ? <Button className="w-full" variant="outline" disabled={buyNow.isPending} onClick={() => buyNow.mutate({ token, bidderToken, itemId: item.id }, { onSuccess: (result) => toast({ title: `You bought ${item.title}`, description: `${formatMoney(result.amountCents)} was added to your event bill.` }), onError: (error) => toast({ title: "Buy it now failed", description: error.message }) })}>Buy now for {formatMoney(item.buyNowCents)}</Button> : null}
                    {biddingOpen && !bidderToken ? (
                      auction.settings.registrationOpen ? <Button className="w-full text-base font-bold" size="lg" onClick={() => openBidderSetup(item.id)}><Gavel className="mr-2 size-4" />Place bid</Button> : <Pill tone="warning">Bidder registration is closed</Pill>
                    ) : biddingOpen && bidderToken && paymentReady ? (
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
                    ) : biddingOpen && bidderToken && !paymentReady ? (
                      <Button className="w-full" onClick={() => openBidderSetup(item.id)}>Continue to secure bidding</Button>
                    ) : !biddingOpen ? (
                      <Pill tone="warning">{opensAt !== null && now < opensAt ? "Bidding has not opened" : "Bidding closed"}</Pill>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}</> : null}

        {bidderToken && (mobileTab === "give" || mobileTab === "auction") ? (
          <Panel className="p-6">
            <div className="flex flex-wrap items-start gap-4"><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Fund-a-Need</p><h2 className="mt-1 text-xl font-bold">Raise your paddle from anywhere</h2><p className="mt-1 text-sm text-muted-foreground">Gifts are added to your single event bill. No goods or services are provided.</p></div><div className="flex flex-wrap gap-2">{[100_00, 250_00, 500_00, 1_000_00].map((amount) => <Button key={amount} variant="outline" disabled={pledge.isPending || !paymentReady} onClick={() => pledge.mutate({ token, bidderToken, amountCents: amount, channel: bidderProfile?.checkedInAt ? "in_room" : "remote" }, { onSuccess: () => toast({ title: `${formatMoney(amount)} pledge recorded` }), onError: (error) => toast({ title: "Couldn't record pledge", description: error.message }) })}>{formatMoney(amount)}</Button>)}</div></div>
            <form className="mt-4 flex max-w-sm gap-2" onSubmit={(event) => { event.preventDefault(); const cents = Math.round(Number(customGift) * 100); if (cents < 100) return; pledge.mutate({ token, bidderToken, amountCents: cents, channel: bidderProfile?.checkedInAt ? "in_room" : "remote" }, { onSuccess: () => { setCustomGift(""); toast({ title: `${formatMoney(cents)} pledge recorded` }); }, onError: (error) => toast({ title: "Couldn't record pledge", description: error.message }) }); }}><Input type="number" min="1" step="0.01" value={customGift} onChange={(event) => setCustomGift(event.target.value)} placeholder="Custom amount" /><Button type="submit" disabled={!paymentReady || pledge.isPending}>Give</Button></form>
          </Panel>
        ) : null}
      </div>
      <BidderSetupSheet
        open={bidderSheetOpen}
        onOpenChange={setBidderSheetOpen}
        bidderToken={bidderToken}
        bidderProfile={bidderProfile}
        bidderProfileLoading={bidderProfileLoading}
        paymentMode={auction.paymentMode}
        name={name}
        email={email}
        phone={phone}
        onNameChange={setName}
        onEmailChange={setEmail}
        onPhoneChange={setPhone}
        registering={register.isPending}
        onRegister={() => register.mutate({ token, draft: { name, email, phone, participantType: "gala", grades: [], autoChargeOptIn: false } }, {
          onSuccess: (bidder) => {
            localStorage.setItem(bidderStorageKey(token), bidder.publicToken);
            setBidderToken(bidder.publicToken);
            toast({ title: `Paddle ${bidder.paddleNumber ?? "assigned"}`, description: "One secure step remains before your first bid." });
          },
          onError: (error) => toast({ title: "Couldn't get your bidder number", description: error.message }),
        })}
        recovering={recoverBidder.isPending}
        onRecover={async (recoveryEmail) => {
          await recoverBidder.mutateAsync({ token, email: recoveryEmail });
        }}
        settingUpWallet={setupWallet.isPending}
        onSetupWallet={() => setupWallet.mutate({ token, bidderToken }, {
          onSuccess: (result) => window.location.assign(result.url),
          onError: (error) => toast({ title: "Couldn't open secure setup", description: error.message }),
        })}
        onReady={returnToBidIntent}
      />
      {bidderToken ? <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-hairline bg-background/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden" aria-label="Bidder navigation">
        {([
          ["auction", "Auction", Gavel],
          ["watching", "Watching", Eye],
          ["mine", "My bids", ReceiptText],
          ["give", "Give", Gift],
        ] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-current={mobileTab === value ? "page" : undefined} onClick={() => { setMobileTab(value); setMyBidsOnly(value === "mine"); setFilter("all"); }} className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold ${mobileTab === value ? "bg-primary-muted text-primary" : "text-muted-foreground"}`}><Icon className="size-5" />{label}{value === "mine" && (bidderProfile?.outbidItemIds.length ?? 0) > 0 ? <span className="absolute mt-[-3px] translate-x-3 rounded-full bg-danger px-1 text-[9px] text-white">{bidderProfile!.outbidItemIds.length}</span> : null}</button>)}
      </nav> : null}
      {showPaddle && bidderProfile ? <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/80 p-5" role="dialog" aria-modal="true" aria-label={`Paddle ${bidderProfile.paddleNumber}`}><section className="relative w-full max-w-sm rounded-3xl bg-foreground p-8 text-center text-background shadow-2xl"><button type="button" aria-label="Close paddle" onClick={() => setShowPaddle(false)} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-background text-foreground"><X className="size-5" /></button><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Your bidder paddle</p><div className="mx-auto mt-5 grid aspect-[.87] w-48 place-items-center bg-primary text-6xl font-black text-primary-foreground [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]" data-numeric>{bidderProfile.paddleNumber}</div>{paddleQr ? <img src={paddleQr} alt="Private QR code for this bidder paddle" className="mx-auto mt-5 size-36 rounded-xl bg-background p-2" /> : null}<p className="mt-4 text-lg font-bold">Paddle {bidderProfile.paddleNumber}</p><p className="mt-2 text-sm text-background/70">Hold this screen up during the live auction, or scan the QR from your printed badge to reopen your private bidder account.</p></section></div> : null}
    </PublicFrame>
  );
}
