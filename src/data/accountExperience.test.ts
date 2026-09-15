import { describe, expect, it } from "vitest";
import {
  accountExperienceForEmail,
  canSwitchAccountExperience,
  parseAccountExperience,
  resolveAccountExperience,
} from "./accountExperience";

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

  it("lets approved product operators switch between account experiences", () => {
    expect(canSwitchAccountExperience("laila@beebizy.com")).toBe(true);
    expect(canSwitchAccountExperience(" TARANG@BEEBIZY.COM ")).toBe(true);
    expect(canSwitchAccountExperience(" SM.SHREYAMAHAJAN@GMAIL.COM ")).toBe(true);
    expect(canSwitchAccountExperience("mary@beebizy.com")).toBe(false);
    expect(canSwitchAccountExperience("ccismasflorea@scu.edu")).toBe(false);
    expect(canSwitchAccountExperience(null)).toBe(false);
  });

  it("honors a saved preview only for an approved switcher", () => {
    expect(resolveAccountExperience("standard", true, "santa-clara")).toBe("santa-clara");
    expect(resolveAccountExperience("santa-clara", false, "standard")).toBe("santa-clara");
    expect(resolveAccountExperience("standard", true, parseAccountExperience("not-a-profile"))).toBe("standard");
  });
});
