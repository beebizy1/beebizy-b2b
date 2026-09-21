import type { TeamUpdateKind } from "../data/entities.ts";

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
  /** Plain text. No HTML template until there is a design worth templating. */
  text: string;
  /** A monitored address so the internal team can answer the person directly. */
  replyTo?: string | null;
  /** Stable business-event key. Resend uses it to collapse uncertain retries. */
  idempotencyKey?: string;
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
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
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

/**
 * Tells someone a task is theirs.
 *
 * Deliberately says what it is, when it is due and where to find it - an email that only
 * says "you have been assigned a task" makes the reader open the app to learn anything,
 * which is a notification that costs more attention than it saves.
 */
export async function notifyTaskAssignment(input: {
  to: string;
  assigneeName: string | null;
  taskTitle: string;
  eventTitle: string;
  dueDate: string | null;
  url: string;
}): Promise<EmailOutcome> {
  const due = input.dueDate
    ? new Date(input.dueDate).toLocaleDateString("en-US", { dateStyle: "medium" })
    : null;

  const outcome = await sendEmail({
    to: input.to,
    subject: `${input.taskTitle} - ${input.eventTitle}`,
    text: [
      `${input.assigneeName ? `Hi ${input.assigneeName},` : "Hi,"}`,
      "",
      `You've been assigned a task on ${input.eventTitle}:`,
      "",
      `  ${input.taskTitle}`,
      due ? `  Due ${due}` : "  No due date set",
      "",
      `Open it here: ${input.url}`,
    ].join("\n"),
  });

  if (outcome.status !== "sent") {
    console.warn("TASK_ASSIGNMENT_EMAIL_NOT_SENT", outcome.status, outcome.reason);
  }
  return outcome;
}

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
      `View your private assignment here: ${input.url}`,
    ].join("\n"),
  });
  if (outcome.status !== "sent") console.warn("VOLUNTEER_ASSIGNMENT_EMAIL_NOT_SENT", outcome.status, outcome.reason);
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
