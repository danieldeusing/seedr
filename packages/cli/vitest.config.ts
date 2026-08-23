import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/cli.ts",
        "src/index.ts",
      ],
      // Measured on 2026-08-23 (lines): handlers 97.7, utils 97.3, config 98.9,
      // commands 89.4, all files 92.8. Thresholds sit a few points below so a
      // real regression fails the run while normal churn does not.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 86,
        "src/handlers/**/*.ts": { lines: 95, statements: 95, functions: 90, branches: 88 },
        "src/utils/**/*.ts": { lines: 95, statements: 95, functions: 95, branches: 90 },
        "src/config/**/*.ts": { lines: 97, statements: 97, functions: 100, branches: 93 },
        "src/commands/**/*.ts": { lines: 85, statements: 85, functions: 85, branches: 82 },
      },
    },
    setupFiles: ["./src/test/setup.ts"],
  },
});
