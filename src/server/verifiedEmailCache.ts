/**
 * Small per-instance cache for Clerk's verified primary email lookup.
 *
 * Vercel Fluid Compute can run several API requests concurrently on one instance. The
 * in-flight promise matters as much as the TTL: a cold dashboard opens multiple routes
 * at once, and all of them should share the same Clerk request instead of creating a
 * burst that hits Clerk's rate limit.
 */
export class VerifiedEmailCache {
  private readonly values = new Map<string, { email: string; expiresAt: number }>();
  private readonly pending = new Map<string, Promise<string | null>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1_000,
  ) {}

  async get(userId: string, load: () => Promise<string | null>): Promise<string | null> {
    const now = Date.now();
    const cached = this.values.get(userId);
    if (cached && cached.expiresAt > now) return cached.email;
    if (cached) this.values.delete(userId);

    const existing = this.pending.get(userId);
    if (existing) return existing;

    const request = load()
      .then((email) => {
        if (email) {
          if (this.values.size >= this.maxEntries) {
            const oldest = this.values.keys().next().value as string | undefined;
            if (oldest) this.values.delete(oldest);
          }
          this.values.set(userId, { email, expiresAt: Date.now() + this.ttlMs });
        }
        return email;
      })
      .finally(() => this.pending.delete(userId));
    this.pending.set(userId, request);
    return request;
  }
}
