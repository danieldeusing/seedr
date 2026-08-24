import { defineConfig } from "vitest/config";

// Unit tests for the registry scripts (sync, compile, validation). Run with `pnpm test:scripts`.
// Network is never touched: every test stubs `fetch`.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    environment: "node",
  },
});
