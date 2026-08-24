/**
 * Anonymous install telemetry.
 *
 * Counting semantics: `seedr add` sends **one event per successful agent
 * target**. Installing one skill for three agents therefore produces three
 * events; a failed target produces none. A dry run never reports anything.
 *
 * Opt-out: setting `SEEDR_NO_TELEMETRY` to *any* value — including `0` or an
 * empty string — disables telemetry before a request is even built. Network
 * failures, timeouts and rejected promises are swallowed: telemetry can never
 * change an install's result or exit code.
 */
import type { InstallResult } from "../handlers/types.js";
import type { InstallScope, ComponentType, CodingAgent } from "../types.js";

declare const CLI_VERSION: string;

export const ANALYTICS_URL = "https://seedr.danieldeusing.de/api/installs";
export const TELEMETRY_OPT_OUT_VARIABLE = "SEEDR_NO_TELEMETRY";

const REQUEST_TIMEOUT_MS = 4000;

/** Exactly what one install event contains — nothing else is sent. */
export interface InstallEvent {
  slug: string;
  type: ComponentType;
  tool: CodingAgent;
  scope: InstallScope;
  version: string;
}

/** One-line description for `--help` output. */
export const TELEMETRY_HELP_TEXT =
  `Sends one anonymous install event per successful agent target to ${ANALYTICS_URL}; ` +
  `set ${TELEMETRY_OPT_OUT_VARIABLE}=1 to disable`;

export function isTelemetryDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TELEMETRY_OPT_OUT_VARIABLE] !== undefined;
}

function cliVersion(): string {
  // CLI_VERSION is injected by tsup at build time; under `tsx` (dev) it is undefined.
  return typeof CLI_VERSION !== "undefined" ? CLI_VERSION : "dev";
}

async function sendEvent(event: InstallEvent): Promise<void> {
  try {
    await fetch(ANALYTICS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Telemetry is best-effort by design.
  }
}

/**
 * Report the successful targets of an install. Resolves once every request
 * has settled (or failed); callers may ignore the promise — it never rejects.
 */
export function trackInstalls(
  slug: string,
  type: ComponentType,
  results: InstallResult[],
  scope: InstallScope
): Promise<void> {
  if (isTelemetryDisabled()) return Promise.resolve();

  const version = cliVersion();
  const sends = results
    .filter((result) => result.success)
    .map((result) => sendEvent({ slug, type, tool: result.agent, scope, version }));

  return Promise.all(sends).then(() => undefined);
}
