/**
 * The planning conversation.
 *
 * The assistant interviews rather than presents a form: one question at a time, until it
 * knows enough to draft a plan. What it is gathering is a `PlanningBrief` — headcount,
 * budget and theme — after which the existing planner does the work. The chat is the way
 * in, not a second planner.
 *
 * Everything here is deterministic and model-free. It backs the demo, it is the fallback
 * when no gateway credential is configured, and it is what the tests exercise. The model
 * path in `server/planner.ts` answers in better prose but must return the same shape, so
 * a conversation behaves the same either way.
 */

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** What the interview has established so far. */
export interface PartialBrief {
  eventType: string | null;
  headcount: number | null;
  totalBudgetCents: number | null;
  theme: string | null;
}

export interface AssistantTurn {
  reply: string;
  /** Set once there is enough to draft against; null while still interviewing. */
  brief: { headcount: number; totalBudgetCents: number; theme: string } | null;
  /** What the assistant still wants, for the UI to show as progress. */
  collected: PartialBrief;
  source: "ai" | "rules";
}

export const EMPTY_BRIEF: PartialBrief = {
  eventType: null,
  headcount: null,
  totalBudgetCents: null,
  theme: null,
};

const EVENT_TYPES: Array<[RegExp, string]> = [
  [/\bgala|fundrais|charit|benefit|auction\b/i, "Gala"],
  [/\bconferenc|summit|symposium\b/i, "Conference"],
  [/\bkick\s?off|sales meeting\b/i, "Summit"],
  [/\blaunch|press day|analyst day|unveil/i, "Product Launch"],
  [/\bworkshop|training|bootcamp|course\b/i, "Training"],
  [/\boffsite|retreat|team building|away day\b/i, "Offsite"],
  [/\btown\s?hall|all[- ]hands\b/i, "Town Hall"],
  [/\bwedding\b/i, "Wedding"],
  [/\bbirthday|anniversar|party\b/i, "Celebration"],
  [/\bnetworking|mixer|reception\b/i, "Reception"],
];

/** The first event type mentioned anywhere in the transcript. */
export function extractEventType(text: string): string | null {
  for (const [pattern, label] of EVENT_TYPES) if (pattern.test(text)) return label;
  return null;
}

/**
 * A headcount, ignoring numbers that are clearly money or a year.
 *
 * "$70,000 for 200 guests" has to yield 200, so anything preceded by a currency symbol or
 * followed by a magnitude suffix is skipped, as is anything that looks like a year.
 */
export function extractHeadcount(text: string): number | null {
  const explicit = text.match(
    /(\d[\d,]*)\s*(?:\+\s*)?(?:guests?|people|attendees?|pax|heads?|seats?|persons?|delegates?)/i,
  );
  if (explicit?.[1]) {
    const n = Number(explicit[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }

  const bare = [...text.matchAll(/(?<![$£€])\b(\d[\d,]*)\b(?!\s*(?:k\b|m\b|%|,\d{3}))/gi)];
  for (const match of bare) {
    const n = Number(match[1]!.replace(/,/g, ""));
    // Years read as headcounts otherwise: "in 2026" is not 2,026 people.
    if (!Number.isFinite(n) || n <= 0 || n > 100_000) continue;
    if (n >= 1990 && n <= 2100) continue;
    return n;
  }
  return null;
}

/** A budget in cents. Understands "$70k", "70,000", "70000 dollars", "£12.5k". */
export function extractBudgetCents(text: string): number | null {
  const withSuffix = text.match(/[$£€]?\s*(\d[\d,]*(?:\.\d+)?)\s*([km])\b/i);
  if (withSuffix?.[1]) {
    const base = Number(withSuffix[1].replace(/,/g, ""));
    const scale = withSuffix[2]!.toLowerCase() === "m" ? 1_000_000 : 1_000;
    if (Number.isFinite(base)) return Math.round(base * scale * 100);
  }

  const currency = text.match(/[$£€]\s*(\d[\d,]*(?:\.\d+)?)/);
  if (currency?.[1]) {
    const n = Number(currency[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return Math.round(n * 100);
  }

  const spelled = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|usd|budget|pounds?|euros?)/i);
  if (spelled?.[1]) {
    const n = Number(spelled[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return null;
}

/** "yes", "sounds good", "that works" — agreeing without repeating the number. */
const AFFIRMATIVE =
  /^(?:yes|yep|yeah|yup|sure|ok|okay|sounds? (?:good|right|about right)|that works|works for me|perfect|great|fine|correct|agreed|go ahead|lets? do (?:that|it))\b/i;

/** The figure the assistant itself put on the table, so agreeing to it can be honoured. */
function suggestedBudgetInAssistantMessage(content: string): number | null {
  const match = content.match(/budget around\s*\$?([\d,]+)/i);
  if (!match?.[1]) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/**
 * Reads the whole transcript rather than only the latest message, so answering two
 * questions at once ("a gala for 300, budget about $120k") is understood.
 */
export function collectBrief(messages: AssistantChatMessage[]): PartialBrief {
  const said = messages.filter((m) => m.role === "user");
  const all = said.map((m) => m.content).join("\n");

  const collected: PartialBrief = {
    eventType: extractEventType(all),
    headcount: extractHeadcount(all),
    totalBudgetCents: extractBudgetCents(all),
    theme: null,
  };

  /*
   * Agreeing to a suggested budget counts as naming it. Without this, "yes that works"
   * carried no number, the budget stayed unknown, and the assistant asked the same
   * question forever — the conversation could not be finished by agreeing with it.
   */
  if (collected.totalBudgetCents == null) {
    for (const [index, message] of messages.entries()) {
      if (message.role !== "assistant") continue;
      const suggestion = suggestedBudgetInAssistantMessage(message.content);
      if (suggestion == null) continue;
      const answer = messages[index + 1];
      if (answer?.role === "user" && AFFIRMATIVE.test(answer.content.trim())) {
        collected.totalBudgetCents = suggestion;
        break;
      }
    }
  }

  // The theme is whatever they said after being asked for it, so it is only read from
  // replies that follow the assistant's theme question.
  for (const [index, message] of messages.entries()) {
    if (message.role !== "assistant" || !/vibe|aesthetic|theme|feel|look/i.test(message.content)) continue;
    const answer = messages[index + 1];
    const said = answer?.content.trim() ?? "";
    // "yes" describes no aesthetic, so it does not become the theme.
    if (answer?.role === "user" && said.length > 2 && !AFFIRMATIVE.test(said)) {
      collected.theme = said.slice(0, 120);
      break;
    }
  }
  return collected;
}

const OPENER =
  "Hi, I'm Bee. I'll help you shape this event — what kind of event are you planning? A gala, a conference, a launch, a team offsite, something else?";

/** Suggested spend per head, used only when someone declines to name a budget. */
const PER_HEAD_CENTS: Record<string, number> = {
  Gala: 40_000,
  Conference: 32_000,
  "Product Launch": 45_000,
  Training: 18_000,
  Offsite: 22_000,
  "Town Hall": 12_000,
  Wedding: 55_000,
  Celebration: 30_000,
  Reception: 25_000,
  Summit: 35_000,
};

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * The next thing to say, given everything said so far.
 *
 * Asks for one missing thing at a time, in the order that matters: what it is, how many
 * people, what it costs, how it should feel. Budget is the one it will guess at, because
 * a suggested number is easier to react to than a blank field.
 */
export function nextTurn(messages: AssistantChatMessage[]): AssistantTurn {
  const collected = collectBrief(messages);
  const rules = { source: "rules" as const, collected };

  if (messages.length === 0) return { ...rules, reply: OPENER, brief: null };

  if (!collected.eventType) {
    return {
      ...rules,
      reply:
        "Got it. What kind of event is it — a gala or fundraiser, a conference, a product launch, a training day, or a team offsite?",
      brief: null,
    };
  }

  if (!collected.headcount) {
    return {
      ...rules,
      reply: `A ${collected.eventType.toLowerCase()} — good. Roughly how many people are you expecting?`,
      brief: null,
    };
  }

  if (!collected.totalBudgetCents) {
    const perHead = PER_HEAD_CENTS[collected.eventType] ?? 30_000;
    const suggested = perHead * collected.headcount;
    return {
      ...rules,
      reply: `${collected.headcount} people. For a ${collected.eventType.toLowerCase()} that size I'd budget around ${money(
        suggested,
      )} all in. Does that sound right, or do you have a number in mind?`,
      brief: null,
    };
  }

  if (!collected.theme) {
    return {
      ...rules,
      reply: `${money(
        collected.totalBudgetCents,
      )} it is. Last thing — what vibe are you going for? Anything from "black tie and classic" to "relaxed and outdoors" helps.`,
      brief: null,
    };
  }

  return {
    ...rules,
    reply: `That's everything I need: a ${collected.eventType.toLowerCase()} for ${collected.headcount}, around ${money(
      collected.totalBudgetCents,
    )}, feeling ${collected.theme.toLowerCase()}. Building your plan now — budget breakdown, checklist, run of show and a vendor shortlist. Nothing is added to the event until you approve it.`,
    brief: {
      headcount: collected.headcount,
      totalBudgetCents: collected.totalBudgetCents,
      theme: collected.theme,
    },
  };
}

export const ASSISTANT_OPENER = OPENER;
