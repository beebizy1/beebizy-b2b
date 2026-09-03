import { describe, expect, it } from "vitest";
import {
  collectBrief,
  extractBudgetCents,
  extractEventType,
  extractHeadcount,
  nextTurn,
  type AssistantChatMessage,
} from "./assistantChat";

const user = (content: string): AssistantChatMessage => ({ role: "user", content });
const bee = (content: string): AssistantChatMessage => ({ role: "assistant", content });

describe("extractHeadcount", () => {
  it("reads an explicit count", () => {
    expect(extractHeadcount("about 250 guests")).toBe(250);
    expect(extractHeadcount("we're expecting 1,200 attendees")).toBe(1200);
  });

  it("does not mistake money for people", () => {
    // The bug this guards: "$70,000 for 200 guests" yielding 70,000.
    expect(extractHeadcount("$70,000 for 200 guests")).toBe(200);
    expect(extractHeadcount("budget is $70k")).toBeNull();
  });

  it("does not mistake a year for a headcount", () => {
    expect(extractHeadcount("sometime in 2026")).toBeNull();
  });

  it("reads a bare number when that is all they gave", () => {
    expect(extractHeadcount("300")).toBe(300);
  });
});

describe("extractBudgetCents", () => {
  it("understands shorthand and full figures", () => {
    expect(extractBudgetCents("around $70k")).toBe(7_000_000);
    expect(extractBudgetCents("$120,000")).toBe(12_000_000);
    expect(extractBudgetCents("1.5m")).toBe(150_000_000);
    expect(extractBudgetCents("50000 dollars")).toBe(5_000_000);
  });

  it("returns null when no money was mentioned", () => {
    expect(extractBudgetCents("a gala for 300 people")).toBeNull();
  });
});

describe("extractEventType", () => {
  it("recognises the common kinds", () => {
    expect(extractEventType("a charity gala")).toBe("Gala");
    expect(extractEventType("our annual sales kickoff")).toBe("Summit");
    expect(extractEventType("a two day workshop")).toBe("Training");
    expect(extractEventType("team away day")).toBe("Offsite");
  });

  it("returns null when nothing matches", () => {
    expect(extractEventType("not sure yet")).toBeNull();
  });
});

describe("the interview", () => {
  it("opens by asking what the event is", () => {
    const turn = nextTurn([]);
    expect(turn.reply).toContain("what kind of event");
    expect(turn.brief).toBeNull();
  });

  it("asks for one thing at a time, in order", () => {
    const asked = (messages: AssistantChatMessage[]) => nextTurn(messages).reply;
    expect(asked([user("a gala")])).toMatch(/how many people/i);
    expect(asked([user("a gala for 300")])).toMatch(/budget/i);
  });

  it("suggests a budget rather than leaving it blank", () => {
    const turn = nextTurn([user("a gala for 300 people")]);
    // 300 × $400 per head.
    expect(turn.reply).toContain("$120,000");
  });

  it("understands several answers given at once", () => {
    const collected = collectBrief([user("a gala for 300 people, budget about $120k")]);
    expect(collected).toMatchObject({ eventType: "Gala", headcount: 300, totalBudgetCents: 12_000_000 });
  });

  it("only reads a theme from the answer to the theme question", () => {
    const withoutQuestion = collectBrief([user("a gala for 300, $120k"), user("black tie and classic")]);
    expect(withoutQuestion.theme).toBeNull();

    const withQuestion = collectBrief([
      user("a gala for 300, $120k"),
      bee("What vibe are you going for?"),
      user("black tie and classic"),
    ]);
    expect(withQuestion.theme).toBe("black tie and classic");
  });

  it("returns a brief once it has everything, and not before", () => {
    const incomplete = nextTurn([user("a gala for 300 people, budget $120k")]);
    expect(incomplete.brief).toBeNull();

    const complete = nextTurn([
      user("a gala for 300 people, budget $120k"),
      bee("What vibe are you going for?"),
      user("black tie and classic"),
    ]);
    expect(complete.brief).toEqual({
      headcount: 300,
      totalBudgetCents: 12_000_000,
      theme: "black tie and classic",
    });
    expect(complete.reply).toMatch(/building your plan/i);
  });

  it("reports progress on every turn, so the UI can show what is still missing", () => {
    const turn = nextTurn([user("a conference")]);
    expect(turn.collected).toMatchObject({ eventType: "Conference", headcount: null });
  });
});

describe("agreeing with the assistant", () => {
  const suggested = bee("300 people. For a gala that size I'd budget around $120,000 all in. Does that sound right?");

  it("treats agreement as naming the suggested budget", () => {
    // Without this the interview deadlocks: "yes that works" holds no number, so the
    // budget stays unknown and the same question is asked forever.
    for (const reply of ["yes that works", "yep", "sounds good", "perfect", "ok"]) {
      const collected = collectBrief([user("a gala for 300"), suggested, user(reply)]);
      expect(collected.totalBudgetCents, reply).toBe(12_000_000);
    }
  });

  it("still prefers a number they name over the one suggested", () => {
    const collected = collectBrief([user("a gala for 300"), suggested, user("more like $90k")]);
    expect(collected.totalBudgetCents).toBe(9_000_000);
  });

  it("does not treat a bare yes as the theme", () => {
    const collected = collectBrief([
      user("a gala for 300, $120k"),
      bee("What vibe are you going for?"),
      user("yes"),
    ]);
    expect(collected.theme).toBeNull();
  });

  it("finishes the interview when every answer was an agreement", () => {
    const turn = nextTurn([
      user("a gala for 300"),
      suggested,
      user("yes that works"),
      bee("What vibe are you going for?"),
      user("black tie and classic"),
    ]);
    expect(turn.brief).toEqual({
      headcount: 300,
      totalBudgetCents: 12_000_000,
      theme: "black tie and classic",
    });
  });
});

describe("when the keyword list misses", () => {
  it("believes what they said rather than asking again", () => {
    // The reported failure: "we are planning a large company dinner" was answered with
    // "What kind of event is it?" — asking again for what it had just been told.
    const turn = nextTurn([user("we are planning a large company dinner")]);
    expect(turn.reply).not.toMatch(/what kind of event/i);
    expect(turn.reply).toMatch(/how many people/i);
    expect(turn.collected.eventType).toBeTruthy();
  });

  it("classifies what it knows, and quotes them back for what it doesn't", () => {
    // A known kind wins, because it also picks the per-head budget.
    expect(collectBrief([user("we are planning a large company dinner")]).eventType).toBe("Dinner");
    expect(collectBrief([user("organising an awards evening")]).eventType).toBe("Awards");
    // Nothing matches, so their own words are used rather than asking again.
    expect(collectBrief([user("a summer BBQ for the team")]).eventType).toBe("summer BBQ for the team");
    expect(collectBrief([user("we are planning a supplier open day")]).eventType).toBe("supplier open day");
  });

  it("still prefers a known type when one is mentioned", () => {
    expect(collectBrief([user("we are planning a charity gala")]).eventType).toBe("Gala");
  });

  it("recognises the kinds the first version missed", () => {
    expect(extractEventType("a company dinner")).toBe("Dinner");
    expect(extractEventType("our awards ceremony")).toBe("Awards");
    expect(extractEventType("the holiday party")).toBe("Celebration");
    expect(extractEventType("a trade show booth")).toBe("Expo");
  });

  it("carries an unknown type all the way to a finished brief", () => {
    const turn = nextTurn([
      user("we are planning a large company dinner"),
      bee("Roughly how many people are you expecting?"),
      user("200"),
      bee("For an event that size I'd budget around $60,000 all in. Does that sound right?"),
      user("yes"),
      bee("What vibe are you going for?"),
      user("warm and modern"),
    ]);
    expect(turn.brief).toMatchObject({ headcount: 200, theme: "warm and modern" });
  });
});
