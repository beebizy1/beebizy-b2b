export const WORKSPACE_SUBSCRIPTION_STATUSES = ["pending", "beta", "active", "past_due", "cancelled"] as const;
export type WorkspaceSubscriptionStatus = (typeof WORKSPACE_SUBSCRIPTION_STATUSES)[number];
export type WorkspaceAccessStatus = WorkspaceSubscriptionStatus | "expired";
