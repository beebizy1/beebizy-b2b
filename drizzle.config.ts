import { defineConfig } from "drizzle-kit";

/**
 * Migrations are files in the repo, not a `push` from a laptop: the schema has to be
 * reviewable in a diff and replayable on a fresh database.
 *
 * DATABASE_URL_UNPOOLED is the direct connection — DDL through a pooler is a well-known
 * way to get stuck migrations.
 */
export default defineConfig({
  schema: "./src/server/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
