import { describe, expect, it } from "vitest";
import { workspaceExperienceForEmail } from "./workspaceExperience";

describe("workspace experience", () => {
  it("recognizes the verified Santa Clara pilot accounts", () => {
    expect(workspaceExperienceForEmail("ccismasflorea@scu.edu")).toBe("santa-clara");
    expect(workspaceExperienceForEmail(" PoorviShukla27@Gmail.com ")).toBe("santa-clara");
    expect(workspaceExperienceForEmail("teammate@scu.edu")).toBe("standard");
  });

  it("leaves every other email on the full standard product", () => {
    expect(workspaceExperienceForEmail("poorvi@santaclaraventures.com")).toBe("standard");
    expect(workspaceExperienceForEmail("cassandra@ccsteaches.org")).toBe("standard");
    expect(workspaceExperienceForEmail("laila@beebizy.com")).toBe("standard");
    expect(workspaceExperienceForEmail("person@example.com")).toBe("standard");
    expect(workspaceExperienceForEmail(null)).toBe("standard");
  });
});
