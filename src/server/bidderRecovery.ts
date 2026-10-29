import { waitUntil } from "@vercel/functions";
import { sendEmail } from "./notify.ts";

export interface BidderRecoveryEmailInput {
  auctionToken: string;
  bidderId: string;
  bidderName: string;
  bidderToken: string;
  email: string;
  eventTitle: string;
  paddleNumber: number | null;
  now?: Date;
}

export function deferBidderRecoveryEmail(input: BidderRecoveryEmailInput): void {
  const hour = (input.now ?? new Date()).toISOString().slice(0, 13);
  const origin = (process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://beebizy-studio-preview.vercel.app").replace(/\/$/, "");
  const privateUrl = `${origin}/auction/${encodeURIComponent(input.auctionToken)}?bidder=${encodeURIComponent(input.bidderToken)}`;
  const delivery = sendEmail({
    to: input.email,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `auction-bidder-access-${input.bidderId}-${hour}`,
    subject: `Your private bidder link - ${input.eventTitle}`,
    text: [
      `Hi ${input.bidderName},`,
      "",
      `Open your private bidder paddle${input.paddleNumber ? ` ${input.paddleNumber}` : ""}: ${privateUrl}`,
      "",
      "This link is private. Do not forward it to another bidder.",
    ].join("\n"),
  }).then((outcome) => {
    if (outcome.status !== "sent") console.warn("BIDDER_RECOVERY_EMAIL_NOT_SENT", input.bidderId, outcome.status, outcome.reason);
  });
  waitUntil(delivery);
}
