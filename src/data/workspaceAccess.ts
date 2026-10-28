import type { PlanId } from "./plans";

export const WORKSPACE_SUBSCRIPTION_STATUSES = ["pending", "beta", "active", "past_due", "cancelled"] as const;
export type WorkspaceSubscriptionStatus = (typeof WORKSPACE_SUBSCRIPTION_STATUSES)[number];
export type WorkspaceAccessStatus = WorkspaceSubscriptionStatus | "expired";

/** The workspace-level access policy returned by the authenticated identity endpoint. */
export interface WorkspaceAccess {
  status: WorkspaceAccessStatus;
  plan: PlanId | null;
  betaStartedAt: string;
  betaEndsAt: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingPortalAvailable?: boolean;
  /** Absent on older clients and test fixtures; only an explicit true removes Stripe. */
  stripeConnectExempt?: boolean;
}

/** A small shared policy seam so every Stripe entry point honors the same exemption. */
export function workspaceUsesStripeConnect(
  access: Pick<WorkspaceAccess, "stripeConnectExempt"> | null | undefined,
): boolean {
  return access?.stripeConnectExempt !== true;
}
