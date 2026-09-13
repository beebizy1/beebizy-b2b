import { describe, expect, it } from "vitest";
import { accountExperienceForEmail } from "./accountExperience";

describe("account experience", () => {
  it("recognizes only the two verified Santa Clara pilot accounts", () => {
    expect(accountExperienceForEmail("ccismasflorea@scu.edu")).toBe("santa-clara");
    expect(accountExperienceForEmail(" PoorviShukla27@Gmail.com ")).toBe("santa-clara");
    expect(accountExperienceForEmail("teammate@scu.edu")).toBe("standard");
  });

  it("leaves every other email on the full standard product", () => {
    expect(accountExperienceForEmail("poorvi@santaclaraventures.com")).toBe("standard");
    expect(accountExperienceForEmail("cassandra@ccsteaches.org")).toBe("standard");
    expect(accountExperienceForEmail("laila@beebizy.com")).toBe("standard");
    expect(accountExperienceForEmail("person@example.com")).toBe("standard");
    expect(accountExperienceForEmail(null)).toBe("standard");
  });
});
