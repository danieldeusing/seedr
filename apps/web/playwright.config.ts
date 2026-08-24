import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against `vite preview` serving the production build in dist/.
// The preview server is extended (vite.config.ts, previewPagesPlugin) to mimic the
// Cloudflare Pages semantics the tests depend on: the headers from public/_headers,
// a real 404 status (with dist/404.html) for unknown paths, and prerendered
// dist/<route>/index.html files. Pages Functions are NOT available in preview —
// functions/api/installs.ts is covered by unit tests instead.
const PORT = 4190;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
