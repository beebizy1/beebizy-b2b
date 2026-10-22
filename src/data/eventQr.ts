export function eventQrFilename(eventTitle: string): string {
  const slug = eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
  return `${slug}-registration-qr.png`;
}
