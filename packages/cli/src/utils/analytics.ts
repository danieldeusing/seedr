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
 *
 * Registry: events go to seedr's public endpoint only for installs from seedr's
 * own registry. An install from a fork or a self-hosted registry sends nothing,
 * so its item names never leave it, unless `SEEDR_ANALYTICS_URL` names an
 * endpoint of its own.
 */
import type { InstallResult } from "../handlers/types.js";
import type { InstallScope, ComponentType, CodingAgent } from "../types.js";
import { USES_DEFAULT_REGISTRY } from "../config/registry.js";

declare const CLI_VERSION: string;

export const ANALYTICS_URL = "https://seedr.danieldeusing.de/api/installs";
export const TELEMETRY_OPT_OUT_VARIABLE = "SEEDR_NO_TELEMETRY";
export const ANALYTICS_URL_VARIABLE = "SEEDR_ANALYTICS_URL";

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
  `Sends one anonymous install event per successful agent target to ${ANALYTICS_URL} ` +
  `(installs from another registry send nothing unless ${ANALYTICS_URL_VARIABLE} names an endpoint); ` +
  `set ${TELEMETRY_OPT_OUT_VARIABLE}=1 to disable`;

export function isTelemetryDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TELEMETRY_OPT_OUT_VARIABLE] !== undefined;
}

/** Where install events go, or null when none are sent for this registry. */
export function analyticsEndpoint(env: NodeJS.ProcessEnv = process.env): string | null {
  return env[ANALYTICS_URL_VARIABLE] || (USES_DEFAULT_REGISTRY ? ANALYTICS_URL : null);
}

function cliVersion(): string {
  // CLI_VERSION is injected by tsup at build time; under `tsx` (dev) it is undefined.
  return typeof CLI_VERSION !== "undefined" ? CLI_VERSION : "dev";
}

async function sendEvent(endpoint: string, event: InstallEvent): Promise<void> {
  try {
    await fetch(endpoint, {
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
  const endpoint = analyticsEndpoint();
  if (isTelemetryDisabled() || endpoint === null) return Promise.resolve();

  const version = cliVersion();
  const sends = results
    .filter((result) => result.success)
    .map((result) => sendEvent(endpoint, { slug, type, tool: result.agent, scope, version }));

  return Promise.all(sends).then(() => undefined);
}
