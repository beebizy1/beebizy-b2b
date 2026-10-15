export interface VendorEventPacketDraft {
  vendorIds: string[];
  subject: string;
  message: string;
  includeRunOfShow: boolean;
  floorplanIds: string[];
  /** Stable across a retry so the email provider can collapse uncertain duplicates. */
  requestId: string;
  /** Server-enforced acknowledgement before any vendor delivery. */
  consentConfirmed: boolean;
  /** Present only for a private preview sent to the organizer. */
  testEmail?: string | null;
}

export type VendorEventPacketDeliveryStatus = "sent" | "failed" | "skipped";

export interface VendorEventPacketDelivery {
  vendorId: string | null;
  vendorName: string;
  email: string;
  status: VendorEventPacketDeliveryStatus;
  reason: string | null;
}

export interface VendorEventPacketResult {
  sent: number;
  failed: number;
  skipped: number;
  attachmentNames: string[];
  deliveries: VendorEventPacketDelivery[];
}

export function defaultVendorPacketSubject(eventTitle: string): string {
  return `Final event details - ${eventTitle}`.slice(0, 200);
}

export function defaultVendorPacketMessage(eventTitle: string): string {
  return `Please review the latest details for ${eventTitle}. The attached documents contain the current run of show and floorplan. Reply to this email with any questions or changes.`;
}

export function isVendorPacketEmail(value: string | null | undefined): boolean {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export function vendorPacketFileSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "event";
}

export function vendorPacketContentKey(draft: Pick<VendorEventPacketDraft, "subject" | "message" | "includeRunOfShow" | "floorplanIds">): string {
  return JSON.stringify({
    subject: draft.subject.trim(),
    message: draft.message.trim(),
    includeRunOfShow: draft.includeRunOfShow,
    floorplanIds: [...new Set(draft.floorplanIds)].sort(),
  });
}
