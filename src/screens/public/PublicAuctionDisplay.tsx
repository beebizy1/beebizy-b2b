import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Gavel } from "lucide-react";
import { usePublicAuction } from "@/data/hooks";
import { formatMoney } from "@/data/money";

export default function PublicAuctionDisplayPage({ token }: { token: string }) {
  const { data: auction } = usePublicAuction(token);
  const [qr, setQr] = useState("");
  const bidUrl = `${window.location.origin}/auction/${token}`;
  useEffect(() => { void QRCode.toDataURL(bidUrl, { width: 360, margin: 1, color: { dark: "#17130a", light: "#ffffff" } }).then(setQr); }, [bidUrl]);
  const active = useMemo(() => auction?.items.filter((item) => item.itemType === "live" && item.status === "open").sort((left, right) => (left.lotNumber ?? 999) - (right.lotNumber ?? 999))[0] ?? null, [auction?.items]);
  if (!auction) return <main className="grid min-h-screen place-items-center bg-[#17130a] text-white">Auction display is not active.</main>;
  return (
    <main className="min-h-screen bg-[#17130a] p-10 text-white">
      <header className="flex items-center justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-[#ffd700]">{auction.eventTitle}</p><h1 className="mt-2 text-4xl font-black">Live Auction</h1></div><p className="text-xl text-white/70">Bid from your phone</p></header>
      {active ? <section className="mx-auto mt-10 grid max-w-7xl gap-10 lg:grid-cols-[1fr_28rem]">
        <div className="overflow-hidden rounded-3xl bg-white text-black">{(active.photoUrls?.[0] || active.imageUrl) ? <img src={active.photoUrls?.[0] || active.imageUrl!} alt={active.title} className="h-[45vh] w-full object-cover" /> : <div className="grid h-[45vh] place-items-center bg-gray-100"><Gavel className="size-20 text-gray-400" /></div>}<div className="p-8"><p className="text-sm font-bold uppercase tracking-[0.15em] text-gray-500">Lot {active.lotNumber ?? ""}</p><h2 className="mt-2 text-5xl font-black leading-tight">{active.title}</h2>{active.creditText ? <p className="mt-3 text-xl text-gray-600">Donated by {active.creditText}</p> : null}<p className="mt-8 text-2xl text-gray-600">Current high bid</p><p className="text-7xl font-black text-green-700">{formatMoney(active.currentBidCents ?? active.startingBidCents)}</p></div></div>
        <aside className="flex flex-col items-center justify-center rounded-3xl bg-[#ffd700] p-8 text-center text-[#17130a]">{qr ? <img src={qr} alt="QR code to open mobile bidding" className="w-full max-w-80 rounded-2xl bg-white p-3" /> : null}<p className="mt-6 text-3xl font-black">Scan to bid</p><p className="mt-2 break-all text-sm">{bidUrl}</p></aside>
      </section> : <section className="grid min-h-[70vh] place-items-center text-center"><div><Gavel className="mx-auto size-20 text-[#ffd700]" /><h2 className="mt-6 text-5xl font-black">Next live lot coming soon</h2><p className="mt-3 text-xl text-white/60">Browse silent auction items from your phone.</p>{qr ? <img src={qr} alt="QR code to open mobile bidding" className="mx-auto mt-8 w-56 rounded-2xl bg-white p-3" /> : null}</div></section>}
    </main>
  );
}
