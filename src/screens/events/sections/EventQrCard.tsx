import { useEffect, useState } from "react";
import { Download, QrCode } from "lucide-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { eventQrFilename } from "@/data/eventQr";

export default function EventQrCard({ eventTitle, url }: { eventTitle: string; url: string }) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, {
      width: 640,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#17130A", light: "#FFFFFF" },
    }).then((value) => { if (active) setDataUrl(value); });
    return () => { active = false; };
  }, [url]);

  const download = async () => {
    if (!dataUrl) return;
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = eventQrFilename(eventTitle);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  };

  return (
    <section className="grid gap-5 border-t border-hairline p-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center" aria-labelledby="event-qr-heading">
      <div className="grid aspect-square w-36 place-items-center overflow-hidden rounded-2xl border border-hairline bg-white p-2 shadow-sm">
        {dataUrl ? <img src={dataUrl} alt={`QR code for ${eventTitle} registration`} className="size-full" /> : <QrCode className="size-10 animate-pulse text-muted-foreground" aria-hidden="true" />}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Event QR code</p>
        <h3 id="event-qr-heading" className="mt-1 text-base font-semibold text-foreground">Scan to open the registration page</h3>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">Place this QR code on signs, table cards, flyers, or printed invitations. Guests can register without a Beebizy login.</p>
        <Button type="button" size="sm" variant="outline" className="mt-3" disabled={!dataUrl} onClick={() => void download()}>
          <Download className="mr-1.5 size-4" aria-hidden="true" />Download PNG
        </Button>
      </div>
    </section>
  );
}
