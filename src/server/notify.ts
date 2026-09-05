/**
 * Outbound email.
 *
 * One function, one provider call, on purpose. The provider is the part most likely to
 * change — a Vercel Marketplace integration may replace it — so everything else in the
 * codebase asks for `sendEmail` and knows nothing about who delivers it.
 *
 * Without a credential this reports `skipped` rather than throwing. A task assignment
 * must not fail because notification is unconfigured: the assignment is the user's work,
 * the email is a courtesy on top of it. The caller logs the outcome so an unconfigured
 * provider is visible in the logs instead of looking like a delivered message — the same
 * failure that made the planner look like it was working when no model was running.
 */

export type EmailOutcome = { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. No HTML template until there is a design worth templating. */
  text: string;
}

export async function sendEmail(message: EmailMessage): Promise<EmailOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { status: "skipped", reason: "RESEND_API_KEY or EMAIL_FROM is not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
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

/**
 * Tells someone a task is theirs.
 *
 * Deliberately says what it is, when it is due and where to find it — an email that only
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
    subject: `${input.taskTitle} — ${input.eventTitle}`,
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
