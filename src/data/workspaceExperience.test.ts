import { describe, expect, it } from "vitest";
import { workspaceExperienceForEmail } from "./workspaceExperience";

describe("workspace experience", () => {
  it("recognizes the verified Santa Clara pilot accounts", () => {
    expect(workspaceExperienceForEmail("ccismasflorea@scu.edu")).toBe("santa-clara");
    expect(workspaceExperienceForEmail(" Poorvi@SantaClaraVentures.com ")).toBe("santa-clara");
    expect(workspaceExperienceForEmail("teammate@scu.edu")).toBe("santa-clara");
  });

  it("leaves every other workspace on the standard product", () => {
    expect(workspaceExperienceForEmail("laila@beebizy.com")).toBe("standard");
    expect(workspaceExperienceForEmail("person@example.com")).toBe("standard");
    expect(workspaceExperienceForEmail(null)).toBe("standard");
  });
});
