import type { InstallResult } from "../handlers/types.js";
import type { InstallScope, ComponentType } from "../types.js";

declare const CLI_VERSION: string;

const ANALYTICS_URL = "https://seedr.danieldeusing.de/api/installs";

export function trackInstalls(
  slug: string,
  type: ComponentType,
  results: InstallResult[],
  scope: InstallScope
): void {
  if (process.env.SEEDR_NO_TELEMETRY) return;

  // CLI_VERSION is injected by tsup at build time; under `tsx` (dev) it is undefined.
  const version = typeof CLI_VERSION !== "undefined" ? CLI_VERSION : "dev";

  for (const result of results) {
    if (!result.success) continue;

    fetch(ANALYTICS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        type,
        tool: result.agent,
        scope,
        version,
      }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  }
}
