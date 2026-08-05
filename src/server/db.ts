/**
 * Database handle.
 *
 * Neon's serverless driver over HTTP, which is the right shape for Vercel Functions: no
 * connection to keep alive between invocations, no pool to exhaust when traffic spikes.
 *
 * Nothing in `src/` outside `src/server/` and `api/` may import this. The browser bundle
 * must never contain a database URL, and `DATABASE_URL` has no client-side env prefix, so
 * an accidental import fails loudly at build time rather than shipping a credential.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Run `vercel env pull` — the Neon Marketplace integration provisions it.",
  );
}

export const db = drizzle(neon(connectionString), { schema });
export { schema };
export type Db = typeof db;
