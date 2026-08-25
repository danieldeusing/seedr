import { defineConfig } from "vitest/config";

// Real filesystem, real temp directories, real git — these operations exist to be
// trusted on disk, so nothing here is mocked.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    // These are integration tests that spawn git and copy the whole registry.
    // Vitest's 5s default is sized for unit tests: on the Windows CI runner the
    // real-registry compile and the transaction rollback take ~9s, so the
    // default failed there while passing everywhere else. Raise it rather than
    // let a slow filesystem read as a broken transaction.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
