import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
// Deep-relative on purpose: Vite externalizes every bare specifier in a config
// file, so `@seedr/registry-ops` would be handed to Node, which cannot resolve the
// package's TS source (its `./paths.js` imports have no built .js on disk). A
// relative path is bundled into the config instead, and esbuild maps .js to .ts.
import { resolveRegistryDir } from "../../packages/registry-ops/src/fsPaths.js";

// Unit tests: React components/hooks/lib under jsdom, the Pages Function and the
// build scripts under node (those files carry a `@vitest-environment node` docblock).
// Playwright owns tests/e2e and is excluded here.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // Same resolution as vite.config.ts: a fork moves its registry out of
      // upstream's registry/, and the tests must read the one the app is built from.
      "@registry": resolveRegistryDir(resolve(__dirname, "../..")),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "functions/**/*.test.ts", "tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    restoreMocks: true,
    // Node >= 22 ships its own experimental `localStorage` global that shadows jsdom's
    // Storage implementation (a stub object without getItem/clear); turn it off in the
    // test workers so the real jsdom storage is what the components see.
    execArgv: ["--no-experimental-webstorage"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "functions/**/*.ts"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/vite-env.d.ts", "functions/**/*.test.ts", "functions/registry-keys.generated.ts"],
      reporter: ["text", "html"],
    },
  },
});
