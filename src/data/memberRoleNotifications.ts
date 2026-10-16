const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000] as const;

/** Never expires: after the fast retries, the durable outbox retries once per day. */
export function memberRoleNotificationRetryAt(attemptCount: number, now = new Date()): Date {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, attemptCount - 1));
  return new Date(now.getTime() + RETRY_DELAYS_MS[index]!);
}
