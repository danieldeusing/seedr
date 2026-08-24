import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Coverage thresholds are a gate, not a report: `vitest run --coverage` fails the
// build below them. They apply from the first screen on (plan §8, P3).
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
