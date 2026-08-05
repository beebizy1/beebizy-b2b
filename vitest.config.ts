import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    // Node environment: everything under test is pure logic plus the in-memory
    // adapter. No jsdom, so the suite stays fast.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
