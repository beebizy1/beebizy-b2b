import { describe, expect, it } from "vitest";
import { memberRoleNotificationRetryAt } from "./memberRoleNotifications";

describe("member role notification retry schedule", () => {
  it("backs off quickly, then keeps retrying daily without dropping the notification", () => {
    const now = new Date("2026-10-15T18:00:00.000Z");
    expect(memberRoleNotificationRetryAt(1, now).toISOString()).toBe("2026-10-15T18:01:00.000Z");
    expect(memberRoleNotificationRetryAt(2, now).toISOString()).toBe("2026-10-15T18:05:00.000Z");
    expect(memberRoleNotificationRetryAt(3, now).toISOString()).toBe("2026-10-15T18:15:00.000Z");
    expect(memberRoleNotificationRetryAt(4, now).toISOString()).toBe("2026-10-15T19:00:00.000Z");
    expect(memberRoleNotificationRetryAt(8, now).toISOString()).toBe("2026-10-16T18:00:00.000Z");
    expect(memberRoleNotificationRetryAt(100, now).toISOString()).toBe("2026-10-16T18:00:00.000Z");
  });
});
