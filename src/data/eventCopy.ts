import type { Event, RunOfShowItem } from "./entities";

export interface RegistrationCopySuggestion {
  aboutHeading: string;
  aboutBody: string;
  agendaIntroduction: string;
  source: "ai" | "fallback";
}

export interface PostEventCopyFacts {
  uniqueRegistered: number;
  uniqueCheckedIn: number;
  attendanceRate: number | null;
  checklistDone: number;
  checklistTotal: number;
  revenueCents: number;
}

export interface PostEventCopySuggestion {
  subject: string;
  thankYouMessage: string;
  wrapUp: string;
  source: "ai" | "fallback";
}

type RegistrationCopyEvent = Pick<Event, "title" | "category" | "description" | "location">;

export function buildRegistrationCopyFallback(
  event: RegistrationCopyEvent,
  agenda: Array<Pick<RunOfShowItem, "title" | "startTime">>,
  current: Partial<Pick<RegistrationCopySuggestion, "aboutHeading" | "aboutBody" | "agendaIntroduction">> = {},
): RegistrationCopySuggestion {
  const aboutHeading = current.aboutHeading?.trim() || (event.category === "Fundraiser" ? "Why we’re gathering" : `About ${event.title}`);
  const aboutBody = current.aboutBody?.trim() || event.description?.trim() || `Join us for ${event.title}${event.location ? ` at ${event.location}` : ""}. Review the event details below and reserve your place.`;
  const firstCue = agenda[0];
  const finalCue = agenda.at(-1);
  const agendaIntroduction = current.agendaIntroduction?.trim() || (firstCue
    ? `The program begins with ${firstCue.title}${firstCue.startTime ? ` at ${firstCue.startTime}` : ""}${finalCue && finalCue !== firstCue ? ` and continues through ${finalCue.title}` : ""}. Please check the schedule below for the latest timing.`
    : "The detailed program will appear here as soon as the event schedule is ready.");
  return { aboutHeading, aboutBody, agendaIntroduction, source: "fallback" };
}

export function buildPostEventCopyFallback(
  event: Pick<Event, "title">,
  facts: PostEventCopyFacts,
): PostEventCopySuggestion {
  const attendance = facts.uniqueCheckedIn === 1 ? "1 guest" : `${facts.uniqueCheckedIn.toLocaleString()} guests`;
  const completion = facts.checklistTotal > 0 ? ` The team completed ${facts.checklistDone} of ${facts.checklistTotal} planned checklist items.` : "";
  return {
    subject: `Thank you for joining ${event.title}`,
    thankYouMessage: facts.uniqueCheckedIn > 0
      ? `Thank you for being part of ${event.title}. We were grateful to welcome ${attendance}, and your participation helped make the event meaningful. We hope to see you again at a future event.`
      : `Thank you for being part of ${event.title}. Your participation helped make the event meaningful, and we hope to see you again at a future event.`,
    wrapUp: facts.uniqueCheckedIn > 0
      ? `${event.title} welcomed ${attendance}${facts.attendanceRate === null ? "" : `, representing a ${facts.attendanceRate}% attendance rate`}.${completion}`
      : `${event.title} does not have any attendee check-ins recorded yet.${completion}`,
    source: "fallback",
  };
}
