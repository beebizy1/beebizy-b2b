import { beforeEach, describe, expect, it, vi } from "vitest";

const updateReturning = vi.hoisted(() => [] as unknown[][]);
const selectReturning = vi.hoisted(() => [] as unknown[][]);
const notifyWorkspaceRoleChanged = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  db: {
    batch: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => updateReturning.shift() ?? []),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectReturning.shift() ?? []),
        })),
      })),
    })),
  },
}));
vi.mock("./auth", () => ({
  lookupUsers: vi.fn(async () => new Map()),
  newId: vi.fn(() => "role-delivery_lease-1"),
}));
vi.mock("./notify", () => ({ notifyWorkspaceRoleChanged }));

const { deliverMemberRoleNotification } = await import("./memberRoleNotifications");

const notification = {
  id: "role-notify_1",
  workspaceId: "workspace-1",
  userId: "user-1",
  recipientEmail: "member@example.com",
  memberName: "Member One",
  workspaceName: "Beebizy",
  newRole: "admin" as const,
  attemptCount: 1,
};

describe("member role notification delivery fencing", () => {
  beforeEach(() => {
    updateReturning.length = 0;
    selectReturning.length = 0;
    notifyWorkspaceRoleChanged.mockReset();
  });

  it("does not call the email provider when the final current-role fence fails", async () => {
    updateReturning.push([notification], []);
    selectReturning.push(
      [{ workspaceId: notification.workspaceId }],
      [{ locked: 1 }],
      [{ role: "admin", email: "member@example.com" }],
    );

    await expect(deliverMemberRoleNotification(notification.id)).resolves.toBe("superseded");
    expect(notifyWorkspaceRoleChanged).not.toHaveBeenCalled();
  });

  it("does not let a stale worker overwrite a reclaimed lease after a provider failure", async () => {
    updateReturning.push([notification], [{ id: notification.id }], []);
    selectReturning.push(
      [{ workspaceId: notification.workspaceId }],
      [{ locked: 1 }],
      [{ role: "admin", email: "member@example.com" }],
    );
    notifyWorkspaceRoleChanged.mockResolvedValue({ status: "failed", reason: "temporary outage" });

    await expect(deliverMemberRoleNotification(notification.id)).resolves.toBe("superseded");
    expect(notifyWorkspaceRoleChanged).toHaveBeenCalledOnce();
  });

  it("marks the notification sent only while the same lease still owns it", async () => {
    updateReturning.push([notification], [{ id: notification.id }], [{ id: notification.id }]);
    selectReturning.push(
      [{ workspaceId: notification.workspaceId }],
      [{ locked: 1 }],
      [{ role: "admin", email: "member@example.com" }],
    );
    notifyWorkspaceRoleChanged.mockResolvedValue({ status: "sent" });

    await expect(deliverMemberRoleNotification(notification.id)).resolves.toBe("sent");
    expect(notifyWorkspaceRoleChanged).toHaveBeenCalledOnce();
  });
});
