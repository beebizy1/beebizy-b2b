import { describe, expect, it } from "vitest";
import { isPrivateBetaHost, privateBetaUrl } from "./privateBetaHost";

describe("private beta host", () => {
  it("allows only the named preview and local development hosts", () => {
    expect(isPrivateBetaHost("beebizy-studio-preview.vercel.app")).toBe(true);
    expect(isPrivateBetaHost("localhost")).toBe(true);
    expect(isPrivateBetaHost("127.0.0.1")).toBe(true);
    expect(isPrivateBetaHost("beebizy.com")).toBe(false);
    expect(isPrivateBetaHost("beebizy-b2b-abc.vercel.app")).toBe(false);
  });

  it("preserves the requested path when moving to the private preview", () => {
    expect(privateBetaUrl("/app/events", "?view=calendar", "#today")).toBe(
      "https://beebizy-studio-preview.vercel.app/app/events?view=calendar#today",
    );
  });
});
