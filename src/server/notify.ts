import type { TeamUpdateKind } from "../data/entities.ts";
import { formatInZone, timeZoneLabel } from "../lib/datetime.ts";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Outbound email.
 *
 * One function, one provider call, on purpose. The provider is the part most likely to
 * change - a Vercel Marketplace integration may replace it - so everything else in the
 * codebase asks for `sendEmail` and knows nothing about who delivers it.
 *
 * Without a credential this reports `skipped` rather than throwing. A task assignment
 * must not fail because notification is unconfigured: the assignment is the user's work,
 * the email is a courtesy on top of it. The caller logs the outcome so an unconfigured
 * provider is visible in the logs instead of looking like a delivered message - the same
 * failure that made the planner look like it was working when no model was running.
 */

export type EmailOutcome = { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text alternative is required even when a branded HTML version is present. */
  text: string;
  html?: string;
  /** A monitored address so the internal team can answer the person directly. */
  replyTo?: string | null;
  /** Stable business-event key. Resend uses it to collapse uncertain retries. */
  idempotencyKey?: string;
  attachments?: Array<{ filename: string; content: string; content_type?: string }>;
}

export async function sendEmail(message: EmailMessage): Promise<EmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM?.trim() || process.env.MAIL_FROM?.trim();
  if (!apiKey || !from) {
    return { status: "skipped", reason: "RESEND_API_KEY or an email sender is not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { status: "failed", reason: `${response.status} ${(await response.text()).slice(0, 200)}` };
    }
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}

function pdfSafeText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
}

function drawCenteredPdfText(page: PDFPage, font: PDFFont, text: string, y: number, size: number, color = rgb(0.09, 0.08, 0.04)): void {
  const safe = pdfSafeText(text);
  page.drawText(safe, { x: Math.max(36, (page.getWidth() - font.widthOfTextAtSize(safe, size)) / 2), y, size, font, color });
}

function drawCenteredWrappedPdfText(page: PDFPage, font: PDFFont, text: string, startY: number, size: number, maxWidth: number): number {
  const words = pdfSafeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const next = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && font.widthOfTextAtSize(next, size) > maxWidth) lines.push(word);
    else if (lines.length) lines[lines.length - 1] = next;
    else lines.push(word);
  }
  lines.slice(0, 3).forEach((line, index) => drawCenteredPdfText(page, font, line, startY - index * (size + 4), size, rgb(0.28, 0.28, 0.28)));
  return startY - Math.min(lines.length, 3) * (size + 4);
}

async function experienceCertificatePdf(input: { organizationName: string; winnerName: string; eventTitle: string; itemTitle: string; deliveryDetails?: string | null; restrictions?: string | null; expiresAt?: string | null }): Promise<string> {
  const document = await PDFDocument.create();
  const page = document.addPage([792, 612]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 22, y: 22, width: 748, height: 568, borderColor: rgb(0.95, 0.75, 0), borderWidth: 5 });
  drawCenteredPdfText(page, bold, input.organizationName, 535, 16, rgb(0.55, 0.42, 0));
  drawCenteredPdfText(page, bold, "AUCTION EXPERIENCE CERTIFICATE", 475, 20);
  drawCenteredPdfText(page, regular, "Presented to", 415, 16, rgb(0.35, 0.35, 0.35));
  drawCenteredPdfText(page, bold, input.winnerName, 365, 34);
  drawCenteredPdfText(page, regular, "for", 320, 16, rgb(0.35, 0.35, 0.35));
  const itemSize = bold.widthOfTextAtSize(pdfSafeText(input.itemTitle), 28) > 700 ? 20 : 28;
  drawCenteredPdfText(page, bold, input.itemTitle, 270, itemSize);
  drawCenteredPdfText(page, regular, `Won at ${input.eventTitle}`, 220, 15, rgb(0.35, 0.35, 0.35));
  let detailY = 185;
  if (input.deliveryDetails) detailY = drawCenteredWrappedPdfText(page, regular, `Redemption: ${input.deliveryDetails}`, detailY, 11, 660);
  if (input.restrictions) detailY = drawCenteredWrappedPdfText(page, regular, `Restrictions: ${input.restrictions}`, detailY - 2, 11, 660);
  if (input.expiresAt) drawCenteredPdfText(page, bold, `Expires: ${new Date(input.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}`, Math.max(105, detailY - 2), 11, rgb(0.28, 0.28, 0.28));
  drawCenteredPdfText(page, regular, `Issued by ${input.organizationName} - Powered by Beebizy`, 75, 11, rgb(0.4, 0.4, 0.4));
  return Buffer.from(await document.save()).toString("base64");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function brandedEmail(input: {
  title: string;
  greeting: string;
  paragraphs: string[];
  details: Array<[string, string]>;
  action?: { label: string; url: string };
}): string {
  const details = input.details.map(([label, value]) => `
    <tr>
      <th scope="row" style="padding:8px 12px;text-align:left;color:#665c35;font-size:14px;font-weight:600;vertical-align:top">${escapeHtml(label)}</th>
      <td style="padding:8px 12px;color:#171717;font-size:14px">${escapeHtml(value)}</td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head>
  <body lang="en" dir="ltr" style="margin:0;background:#fffaf0;color:#171717;font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fffaf0;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #eadfbc;border-radius:16px;overflow:hidden">
          <tr><td style="background:#ffd700;padding:18px 24px;font-size:20px;font-weight:800">beebizy</td></tr>
          <tr><td style="padding:28px 24px">
            <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25">${escapeHtml(input.title)}</h1>
            <p style="margin:0 0 14px;font-size:16px;line-height:1.55">${escapeHtml(input.greeting)}</p>
            ${input.paragraphs.map((paragraph) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55">${escapeHtml(paragraph)}</p>`).join("")}
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;background:#fffaf0;border-radius:10px">${details}</table>
            ${input.action ? `<p style="margin:22px 0 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;background:#17130a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${escapeHtml(input.action.label)}</a></p>` : ""}
          </td></tr>
          <tr><td style="padding:18px 24px;color:#665c35;font-size:13px;line-height:1.5">Questions? Reply to this email and the event team will help.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Sends one receipt after a free registration or confirmed Stripe payment. */
export async function notifyTicketOrderConfirmation(input: {
  orderId: string;
  to: string;
  buyerName: string;
  eventTitle: string;
  ticketName: string;
  quantity: number;
  amountCents: number;
  applicationFeeCents: number;
  startsAt: string;
  timeZone: string;
}): Promise<EmailOutcome> {
  const when = formatInZone(input.startsAt, input.timeZone, "full");
  const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.amountCents / 100);
  const subject = `Tickets confirmed - ${emailSubjectPart(input.eventTitle)}`;
  const details: Array<[string, string]> = [
    ["Event", input.eventTitle],
    ["When", `${when} ${timeZoneLabel(input.timeZone, new Date(input.startsAt))}`],
    ["Ticket", input.ticketName],
    ["Quantity", String(input.quantity)],
    ["Total paid", total],
    ["Order", input.orderId],
  ];
  const outcome = await sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `ticket-order-confirmation-${input.orderId}`,
    subject,
    text: [
      `Hi ${input.buyerName},`,
      "",
      `Your tickets for ${input.eventTitle} are confirmed.`,
      ...details.map(([label, value]) => `${label}: ${value}`),
      "",
      "Questions? Reply to this email and the event team will help.",
    ].join("\n"),
    html: brandedEmail({
      title: "Your tickets are confirmed",
      greeting: `Hi ${input.buyerName},`,
      paragraphs: [`Your tickets for ${input.eventTitle} are confirmed.`],
      details,
    }),
  });
  if (outcome.status !== "sent") {
    console.warn("TICKET_CONFIRMATION_EMAIL_NOT_SENT", input.orderId, outcome.status, outcome.reason);
  }
  return outcome;
}

/** A direct invitation to a specific event, kept separate from promotional campaigns. */
export async function notifyTicketInvitation(input: {
  invitationId: string;
  to: string;
  recipientName: string;
  eventTitle: string;
  startsAt: string;
  timeZone: string;
  invitationUrl: string;
  headline?: string;
  welcomeMessage?: string;
  designedHtml?: string;
  deliveryAttemptKey?: string;
}): Promise<EmailOutcome> {
  const when = `${formatInZone(input.startsAt, input.timeZone, "full")} ${timeZoneLabel(input.timeZone, new Date(input.startsAt))}`;
  const subject = `You're invited - ${emailSubjectPart(input.headline || input.eventTitle)}`;
  const details: Array<[string, string]> = [["Event", input.eventTitle], ["When", when]];
  const text = [
    `Hi ${input.recipientName},`,
    "",
    input.welcomeMessage || `You are invited to ${input.eventTitle}.`,
    `When: ${when}`,
    "",
    `Choose a free or paid ticket: ${input.invitationUrl}`,
    "",
    "This invitation was sent by the event organizer through Beebizy. Questions? Reply to this email.",
  ].join("\n");
  const html = input.designedHtml ?? brandedEmail({
    title: `You're invited to ${input.eventTitle}`,
    greeting: `Hi ${input.recipientName},`,
    paragraphs: [`You are invited to ${input.eventTitle}.`],
    details,
    action: { label: "Choose a ticket", url: input.invitationUrl },
  });
  const outcome = await sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `ticket-invitation-${input.invitationId}${input.deliveryAttemptKey ? `-${input.deliveryAttemptKey}` : ""}`,
    subject,
    text,
    html,
  });
  if (outcome.status !== "sent") {
    console.warn("TICKET_INVITATION_EMAIL_NOT_SENT", input.invitationId, outcome.status, outcome.reason);
  }
  return outcome;
}

export async function notifyAuctionOutbid(input: {
  bidId: string;
  to: string;
  bidderName: string;
  eventTitle: string;
  itemTitle: string;
  currentBidCents: number;
  auctionUrl: string;
}): Promise<EmailOutcome> {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.currentBidCents / 100);
  return sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `auction-outbid-${input.bidId}-${input.to.toLowerCase()}`,
    subject: `You've been outbid - ${emailSubjectPart(input.itemTitle)}`,
    text: [
      `Hi ${input.bidderName},`, "", `Another bidder is leading ${input.itemTitle} at ${amount}.`,
      `Return to ${input.eventTitle}: ${input.auctionUrl}`,
    ].join("\n"),
    html: brandedEmail({
      title: "You've been outbid",
      greeting: `Hi ${input.bidderName},`,
      paragraphs: [`Another bidder is leading ${input.itemTitle} at ${amount}.`],
      details: [["Auction", input.eventTitle], ["Item", input.itemTitle], ["Current bid", amount]],
      action: { label: "Return to the auction", url: input.auctionUrl },
    }),
  });
}

export async function notifyAuctionWinner(input: {
  orderId: string;
  to: string;
  bidderName: string;
  eventTitle: string;
  itemTitle: string;
  amountCents: number;
  paymentUrl: string | null;
}): Promise<EmailOutcome> {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.amountCents / 100);
  return sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `auction-winner-${input.orderId}`,
    subject: `You won ${emailSubjectPart(input.itemTitle)}`,
    text: [
      `Hi ${input.bidderName},`, "", `You won ${input.itemTitle} for ${amount} at ${input.eventTitle}.`,
      input.paymentUrl ? `Complete payment securely: ${input.paymentUrl}` : "This item was added to your single end-of-night event bill.",
    ].join("\n"),
    html: brandedEmail({
      title: "You won!",
      greeting: `Hi ${input.bidderName},`,
      paragraphs: [`You won ${input.itemTitle} at ${input.eventTitle}.`],
      details: [["Winning item", input.itemTitle], ["Winning bid", amount]],
      action: input.paymentUrl ? { label: "Complete secure payment", url: input.paymentUrl } : undefined,
    }),
  });
}

export async function notifyAuctionPaymentConfirmation(input: {
  orderId: string;
  to: string;
  bidderName: string;
  eventTitle: string;
  itemTitle: string;
  amountCents: number;
  deliveryDetails: string | null;
}): Promise<EmailOutcome> {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.amountCents / 100);
  return sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `auction-payment-confirmation-${input.orderId}`,
    subject: `Payment confirmed - ${emailSubjectPart(input.itemTitle)}`,
    text: [
      `Hi ${input.bidderName},`, "", `Your ${amount} payment for ${input.itemTitle} is confirmed.`,
      input.deliveryDetails ? `Fulfillment: ${input.deliveryDetails}` : "The event team will contact you about pickup or delivery.",
    ].join("\n"),
    html: brandedEmail({
      title: "Auction payment confirmed",
      greeting: `Hi ${input.bidderName},`,
      paragraphs: [
        `Your ${amount} payment for ${input.itemTitle} at ${input.eventTitle} is confirmed.`,
        input.deliveryDetails || "The event team will contact you about pickup or delivery.",
      ],
      details: [["Item", input.itemTitle], ["Amount paid", amount], ["Order", input.orderId]],
    }),
  });
}

export async function notifyAuctionDonorThankYou(input: {
  donorId: string;
  to: string;
  contactName: string;
  donorName: string;
  eventTitle: string;
  itemTitles: string[];
  receivedDate: string;
}): Promise<EmailOutcome> {
  const itemSummary = input.itemTitles.length > 0 ? input.itemTitles.join(", ") : "your auction donation";
  return sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `auction-donor-thank-you-${input.donorId}`,
    subject: `Thank you for supporting ${emailSubjectPart(input.eventTitle)}`,
    text: [
      `Hi ${input.contactName},`, "", `Thank you to ${input.donorName} for supporting ${input.eventTitle}.`,
      `Property received: ${itemSummary}`,
      `Date received: ${input.receivedDate}`,
      "No goods or services were provided in exchange for this donated property.",
      "No dollar value is stated. The donor is responsible for valuing the contribution and should consult a tax professional about deductibility.",
      "",
      "Your contribution helps make this event possible.",
    ].join("\n"),
    html: brandedEmail({
      title: "Thank you for your auction donation",
      greeting: `Hi ${input.contactName},`,
      paragraphs: [
        `Thank you to ${input.donorName} for supporting ${input.eventTitle}.`,
        "No goods or services were provided in exchange for this donated property.",
        "No dollar value is stated. The donor is responsible for valuing the contribution and should consult a tax professional about deductibility.",
        "Your contribution helps make this event possible.",
      ],
      details: [["Event", input.eventTitle], ["Property received", itemSummary], ["Date received", input.receivedDate]],
    }),
  });
}

export async function notifyBidderBill(input: {
  billId: string;
  to: string;
  bidderName: string;
  eventTitle: string;
  totalCents: number;
  billUrl: string;
}): Promise<EmailOutcome> {
  const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.totalCents / 100);
  return sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `bidder-bill-${input.billId}`,
    subject: `Your event bill - ${emailSubjectPart(input.eventTitle)}`,
    text: [`Hi ${input.bidderName},`, "", `Your combined bill for ${input.eventTitle} is ${total}.`, `Review and pay: ${input.billUrl}`].join("\n"),
    html: brandedEmail({
      title: "Your combined event bill",
      greeting: `Hi ${input.bidderName},`,
      paragraphs: [`Your auction items and Fund-a-Need gifts for ${input.eventTitle} are together in one bill.`],
      details: [["Total", total]],
      action: { label: "Review and pay", url: input.billUrl },
    }),
  });
}

export async function notifyCombinedFundraisingReceipt(input: {
  receiptId: string;
  to: string;
  payerName: string;
  organizationName: string;
  eventTitle: string;
  receiptNumber: string;
  amountCents: number;
  deductibleCents: number;
  receiptUrl: string;
  corrected: boolean;
}): Promise<EmailOutcome> {
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  return sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `fundraising-receipt-${input.receiptId}`,
    subject: `${input.corrected ? "Corrected receipt" : "Receipt"} ${input.receiptNumber} - ${emailSubjectPart(input.eventTitle)}`,
    text: [
      `Hi ${input.payerName},`, "", `${input.organizationName} issued ${input.corrected ? "a corrected" : "your"} receipt for ${input.eventTitle}.`,
      `Amount paid: ${money(input.amountCents)}`, `Tax-deductible amount: ${money(input.deductibleCents)}`,
      `View and download: ${input.receiptUrl}`,
    ].join("\n"),
    html: brandedEmail({
      title: input.corrected ? "Corrected fundraising receipt" : "Your fundraising receipt",
      greeting: `Hi ${input.payerName},`,
      paragraphs: [`${input.organizationName} issued this receipt for ${input.eventTitle}.`],
      details: [["Receipt", input.receiptNumber], ["Amount paid", money(input.amountCents)], ["Tax-deductible amount", money(input.deductibleCents)]],
      action: { label: "View and download receipt", url: input.receiptUrl },
    }),
  });
}

export async function notifyExperienceCertificate(input: {
  orderId: string;
  to: string;
  winnerName: string;
  eventTitle: string;
  itemTitle: string;
  organizationName: string;
  deliveryDetails?: string | null;
  restrictions?: string | null;
  expiresAt?: string | null;
  certificateUrl: string;
}): Promise<EmailOutcome> {
  const pdf = await experienceCertificatePdf(input);
  return sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `auction-certificate-${input.orderId}`,
    subject: `Your certificate - ${emailSubjectPart(input.itemTitle)}`,
    text: `Hi ${input.winnerName},\n\nYour experience certificate for ${input.itemTitle} at ${input.eventTitle} is attached as a PDF.\n\nYou can also view it online: ${input.certificateUrl}`,
    html: brandedEmail({ title: "Your auction certificate", greeting: `Hi ${input.winnerName},`, paragraphs: [`Your experience certificate for ${input.itemTitle} at ${input.eventTitle} is ready.`], details: [["Experience", input.itemTitle], ["Event", input.eventTitle]], action: { label: "View certificate", url: input.certificateUrl } }),
    attachments: [{ filename: `${pdfSafeText(input.itemTitle).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "auction-experience"}-certificate.pdf`, content: pdf, content_type: "application/pdf" }],
  });
}

const FEEDBACK_NOTIFICATION_EMAIL = "hello@beebizy.com";

function emailSubjectPart(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Sends the exact stored feedback to Beebizy's monitored product inbox. */
export async function notifyFeedbackSubmission(input: {
  feedbackId: string;
  userName: string | null;
  userEmail: string | null;
  workspaceName: string;
  category: string;
  message: string;
  pageUrl: string | null;
  createdAt: string;
  inboxUrl: string;
}): Promise<EmailOutcome> {
  const sender = input.userName || input.userEmail || "a Beebizy user";
  const outcome = await sendEmail({
    to: FEEDBACK_NOTIFICATION_EMAIL,
    replyTo: input.userEmail,
    idempotencyKey: `product-feedback-${input.feedbackId}`,
    subject: `New Beebizy feedback from ${emailSubjectPart(sender)}`,
    text: [
      "New feedback was submitted in Beebizy.",
      "",
      `From: ${input.userName ?? "-"}`,
      `Email: ${input.userEmail ?? "-"}`,
      `Workspace: ${input.workspaceName}`,
      `Category: ${input.category}`,
      `Submitted: ${input.createdAt}`,
      input.pageUrl ? `Submitted from: ${input.pageUrl}` : null,
      "",
      "Exact feedback:",
      input.message,
      "",
      `Open the private feedback inbox: ${input.inboxUrl}`,
    ].filter((line): line is string => line !== null).join("\n"),
  });
  if (outcome.status !== "sent") {
    console.warn("PRODUCT_FEEDBACK_EMAIL_NOT_SENT", input.feedbackId, outcome.status, outcome.reason);
  }
  return outcome;
}

/** Confirms a public registration without making registration depend on email delivery. */
export async function notifyRegistrationConfirmation(input: {
  registrationId: string;
  to: string;
  guestName: string;
  eventTitle: string;
  segment: string;
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  location: string | null;
  eventUrl: string;
}): Promise<EmailOutcome> {
  const start = formatInZone(input.startsAt, input.timeZone, "full");
  const end = input.endsAt ? formatInZone(input.endsAt, input.timeZone, "full") : null;
  const zone = timeZoneLabel(input.timeZone, new Date(input.startsAt));
  const outcome = await sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `registration-confirmation-${input.registrationId}`,
    subject: `Registration confirmed - ${emailSubjectPart(input.eventTitle)}`,
    text: [
      `Hi ${input.guestName},`,
      "",
      `Your registration for ${input.eventTitle} is confirmed.`,
      `Guest type: ${input.segment}`,
      `When: ${start}${end ? ` to ${end}` : ""} ${zone}`,
      input.location ? `Where: ${input.location}` : null,
      "",
      `View the event: ${input.eventUrl}`,
      "",
      "If you have questions, reply to this email and the Beebizy team will help.",
    ].filter((line): line is string => line !== null).join("\n"),
  });
  if (outcome.status !== "sent") {
    console.warn("REGISTRATION_CONFIRMATION_EMAIL_NOT_SENT", input.registrationId, outcome.status, outcome.reason);
  }
  return outcome;
}

const ASSIGNMENT_CALENDAR_HELP = "The assignment page also lets you add it to Google Calendar.";

export async function notifyVolunteerAssignment(input: {
  to: string;
  volunteerName: string;
  role: string;
  eventTitle: string;
  dayNumber: number;
  startTime: string;
  endTime: string;
  url: string;
}): Promise<EmailOutcome> {
  const outcome = await sendEmail({
    to: input.to,
    subject: `Your ${input.role} shift - ${input.eventTitle}`,
    text: [
      `Hi ${input.volunteerName},`,
      "",
      `You've been assigned to ${input.eventTitle}.`,
      `Role: ${input.role}`,
      `Shift: Day ${input.dayNumber}, ${input.startTime}–${input.endTime}`,
      "",
      `Open this shift and mark it complete when you're done: ${input.url}`,
      ASSIGNMENT_CALENDAR_HELP,
    ].join("\n"),
  });
  if (outcome.status !== "sent") console.warn("VOLUNTEER_ASSIGNMENT_EMAIL_NOT_SENT", outcome.status, outcome.reason);
  return outcome;
}

export interface AssignmentSummaryItem {
  kind: "Checklist" | "Run of show" | "Volunteer shift";
  title: string;
  timing: string;
  url: string;
}

/** Sends the first assignment immediately instead of waiting for an organizer to run a summary. */
export async function notifyWorkAssignment(input: {
  assignmentId: string;
  kind: AssignmentSummaryItem["kind"];
  to: string;
  assigneeName: string;
  eventTitle: string;
  title: string;
  timing: string;
  url: string;
}): Promise<EmailOutcome> {
  const outcome = await sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `work-assignment-${input.kind}-${input.assignmentId}-${input.to.toLowerCase()}`,
    subject: `${input.kind} assignment - ${emailSubjectPart(input.eventTitle)}`,
    text: [
      `Hi ${input.assigneeName || "team member"},`,
      "",
      `You've been assigned work for ${input.eventTitle}.`,
      `Task: ${input.title}`,
      input.timing,
      "",
      `Open the assignment and mark it complete when you're done: ${input.url}`,
      ASSIGNMENT_CALENDAR_HELP,
    ].filter(Boolean).join("\n"),
  });
  if (outcome.status !== "sent") {
    console.warn("WORK_ASSIGNMENT_EMAIL_NOT_SENT", input.assignmentId, outcome.status, outcome.reason);
  }
  return outcome;
}

/** Sends one event-level responsibility summary instead of making the organizer forward separate task emails. */
export async function notifyAssignmentSummary(input: {
  to: string;
  assigneeName: string;
  eventTitle: string;
  items: AssignmentSummaryItem[];
}): Promise<EmailOutcome> {
  const lines = input.items.flatMap((item, index) => [
    `${index + 1}. ${item.title}`,
    `   ${item.kind}${item.timing ? ` - ${item.timing}` : ""}`,
    `   Open: ${item.url}`,
  ]);
  const outcome = await sendEmail({
    to: input.to,
    subject: `Your responsibilities - ${input.eventTitle}`,
    text: [
      `Hi ${input.assigneeName || "team member"},`,
      "",
      `Here is your current open work for ${input.eventTitle}:`,
      "",
      ...lines,
      "",
      "Each private link opens the exact assignment and lets you mark it complete or add it to Google Calendar.",
    ].join("\n"),
  });
  if (outcome.status !== "sent") {
    console.warn("ASSIGNMENT_SUMMARY_EMAIL_NOT_SENT", outcome.status, outcome.reason);
  }
  return outcome;
}

export async function notifyTeamUpdate(input: {
  to: string;
  eventTitle: string;
  kind: TeamUpdateKind;
  message: string;
  url: string;
}): Promise<EmailOutcome> {
  const outcome = await sendEmail({
    to: input.to,
    subject: `Live ${input.kind === "vendor-delay" ? "vendor delay" : input.kind} update - ${input.eventTitle}`,
    text: ["Hi team,", "", `A live update was posted for ${input.eventTitle}:`, "", input.message, "", `Open the event: ${input.url}`].join("\n"),
  });
  if (outcome.status !== "sent") console.warn("TEAM_UPDATE_EMAIL_NOT_SENT", outcome.status, outcome.reason);
  return outcome;
}

export async function notifyVendorMessage(input: {
  to: string;
  vendorName: string;
  senderName: string;
  subject?: string | null;
  message: string;
  url: string;
}): Promise<EmailOutcome> {
  const outcome = await sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    subject: input.subject?.trim() || `Message from ${input.senderName} via Beebizy`,
    text: [
      `Hi ${input.vendorName},`,
      "",
      `${input.senderName} sent you a message through Beebizy:`,
      "",
      input.message,
      "",
      `Read and reply in your private conversation: ${input.url}`,
      "No Beebizy account is required. Keep this link private.",
    ].join("\n"),
  });
  if (outcome.status !== "sent") console.warn("VENDOR_MESSAGE_EMAIL_NOT_SENT", outcome.status, outcome.reason);
  return outcome;
}

export async function notifyRfpInvitation(input: {
  invitationId: string;
  to: string;
  vendorName: string;
  eventTitle: string;
  rfpTitle: string;
  deadline: string | null;
  url: string;
}): Promise<EmailOutcome> {
  const deadline = input.deadline
    ? new Date(input.deadline).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })
    : null;
  const outcome = await sendEmail({
    to: input.to,
    replyTo: "hello@beebizy.com",
    idempotencyKey: `rfp-invitation-${input.invitationId}`,
    subject: `Proposal request: ${input.eventTitle}`,
    text: [
      `Hi ${input.vendorName},`,
      "",
      `You are invited to submit a proposal for ${input.eventTitle}.`,
      `Request: ${input.rfpTitle}`,
      deadline ? `Reply by: ${deadline}` : null,
      "",
      `Review the full brief and submit your proposal: ${input.url}`,
      "",
      "You do not need a Beebizy account to use this private link.",
    ].filter((line): line is string => line !== null).join("\n"),
  });
  if (outcome.status !== "sent") console.warn("RFP_INVITATION_EMAIL_NOT_SENT", outcome.status, outcome.reason);
  return outcome;
}
