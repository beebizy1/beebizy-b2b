import { describe, expect, it } from "vitest";
import {
  ALPHABETICAL_CHECK_IN_LANES,
  guestLastInitial,
  guestMatchesLane,
  parseAlphabeticalLane,
} from "./checkInLanes";

describe("alphabetical check-in lanes", () => {
  it("defines the six counter ranges used by the event signs", () => {
    expect(ALPHABETICAL_CHECK_IN_LANES.map((lane) => lane.range)).toEqual([
      "A-D",
      "E-H",
      "I-L",
      "M-P",
      "Q-T",
      "U-Z",
    ]);
  });

  it("routes guests by the first letter of their last name", () => {
    expect(guestLastInitial("Tarang Goyal")).toBe("G");
    expect(guestLastInitial("Goyal, Tarang")).toBe("G");
    expect(guestLastInitial("Élodie Ångström")).toBe("A");
    expect(guestLastInitial("Martin Luther King Jr.")).toBe("K");
    expect(guestMatchesLane("Tarang Goyal", "Last names E-H")).toBe(true);
    expect(guestMatchesLane("Tarang Goyal", "A-D")).toBe(false);
  });

  it("accepts range punctuation used in typed station labels", () => {
    expect(parseAlphabeticalLane("Last names A–D")).toEqual({ start: "A", end: "D" });
    expect(parseAlphabeticalLane("u - z")).toEqual({ start: "U", end: "Z" });
  });

  it("fails closed for missing names and non-alphabetical lanes", () => {
    expect(guestLastInitial("  ")).toBeNull();
    expect(parseAlphabeticalLane("VIP guests")).toBeNull();
    expect(guestMatchesLane("Ada Lovelace", "VIP guests")).toBe(false);
  });
});
