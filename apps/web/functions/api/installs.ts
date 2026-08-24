import { canonicalAgent, isValidSlug, itemKey } from "@seedr/registry-ops/pure";
import type { ComponentType } from "@seedr/shared";
import { REGISTRY_KEYS } from "../registry-keys.generated";

/*
 * POST /api/installs — the CLI's anonymous install counter.
 *
 * What this telemetry can and cannot say. An event carries item, type, tool,
 * scope, CLI version, a coarse country derived by Cloudflare and a timestamp —
 * no identifier of any kind (no IP, no machine id, no cookie). So the numbers
 * are counts of install *commands*, not of installers: one person running the
 * command ten times and ten people running it once are indistinguishable, and
 * anyone can POST a valid-looking event. Treat the data as a rough popularity
 * signal, never as "unique installs" or as evidence about a person. The CLI
 * sends nothing when SEEDR_NO_TELEMETRY is set.
 *
 * Guards: the (type, slug) must exist in the registry compiled at build time
 * (functions/registry-keys.generated.ts); each client may record at most
 * PER_CLIENT_MAX_PER_WINDOW events per 60-second window, counted atomically in
 * the `rate_limits` table under a SHA-256 of the client IP + a daily salt that
 * is never stored with an event and cannot be linked across days; a global cap
 * bounds D1 write cost. Retention: events older than 90 days and rate-limit
 * rows older than two windows are deleted opportunistically on each request.
 */

export interface Env {
  DB: D1Database;
  /** Optional extra secret mixed into the per-client hash (the UTC date is always mixed in). */
  RATE_SALT?: string;
}

export const RATE_WINDOW_SECONDS = 60;
export const PER_CLIENT_MAX_PER_WINDOW = 20;
export const GLOBAL_MAX_PER_WINDOW = 100;
export const RETENTION_DAYS = 90;
export const RETENTION_DELETE_BATCH = 200;
export const MAX_BODY_BYTES = 1024;

// Tool ids are validated and canonicalised by the shared agent vocabulary:
// deprecated ids sent by older CLIs (gemini) are stored under their canonical
// name (antigravity), so the counts stay one series per tool.
const VALID_TYPES = new Set(["skill", "plugin", "agent", "hook", "mcp", "command", "settings"]);
const VALID_SCOPES = new Set(["project", "user", "local"]);
const VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,20}$/;

export type ErrorCode =
  | "method_not_allowed"
  | "payload_too_large"
  | "bad_json"
  | "invalid_payload"
  | "unknown_item"
  | "rate_limited"
  | "db_error";

interface InstallPayload {
  slug: string;
  type: string;
  tool: string;
  scope: string;
  version: string;
}

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function fail(status: number, code: ErrorCode, error: string, extraHeaders: Record<string, string> = {}): Response {
  return json({ error, code }, status, extraHeaders);
}

/** Validates the decoded body; returns the payload or a message describing the first problem. */
export function validatePayload(body: unknown): InstallPayload | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "body must be a JSON object";
  const { slug, type, tool, scope, version } = body as Record<string, unknown>;
  if (typeof slug !== "string" || !isValidSlug(slug)) return "slug must be a lowercase identifier (1-100 chars)";
  if (typeof type !== "string" || !VALID_TYPES.has(type)) return `type must be one of: ${[...VALID_TYPES].join(", ")}`;
  const canonicalTool = typeof tool === "string" ? canonicalAgent(tool) : null;
  if (canonicalTool === null) return "tool is not a known coding agent";
  if (typeof scope !== "string" || !VALID_SCOPES.has(scope)) return `scope must be one of: ${[...VALID_SCOPES].join(", ")}`;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) return "version must be a version string (1-20 chars)";
  return { slug, type, tool: canonicalTool, scope, version };
}

export function registryKey(type: string, slug: string): string {
  // The generator builds the allowlist with this same function; a divergence
  // here would 404 every event and nothing would report it.
  return itemKey(type as ComponentType, slug);
}

/** SHA-256 of IP + daily salt, hex. The same client hashes the same within a day and differently tomorrow. */
export async function clientKey(ip: string, salt: string | undefined, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10);
  const material = new TextEncoder().encode(`${ip}|${salt ?? ""}|${day}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Atomic per-client counter: one upsert that starts a new window or bumps the
 * current one and returns the count. Concurrent requests each get their own
 * RETURNING value, so at most PER_CLIENT_MAX_PER_WINDOW of them see count <= max.
 */
async function countClientRequest(db: D1Database, key: string, windowStart: number): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (client_key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(client_key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

async function countGlobalRequests(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM installs WHERE installed_at > datetime('now', ?1)`)
    .bind(`-${RATE_WINDOW_SECONDS} seconds`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Bounded, opportunistic retention: never more than one small batch per request. */
async function deleteExpired(db: D1Database, windowStart: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        `DELETE FROM installs WHERE id IN (
           SELECT id FROM installs WHERE installed_at < datetime('now', ?1) LIMIT ?2
         )`
      )
      .bind(`-${RETENTION_DAYS} days`, RETENTION_DELETE_BATCH),
    db.prepare(`DELETE FROM rate_limits WHERE window_start < ?1`).bind(windowStart - 1),
  ]);
}

async function readBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: fail(413, "payload_too_large", `body must be at most ${MAX_BODY_BYTES} bytes`) };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: fail(400, "bad_json", "body could not be read") };
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: fail(413, "payload_too_large", `body must be at most ${MAX_BODY_BYTES} bytes`) };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: fail(400, "bad_json", "body is not valid JSON") };
  }
}

export async function handleInstall(
  request: Request,
  env: Env,
  waitUntil: (promise: Promise<unknown>) => void,
  now = new Date()
): Promise<Response> {
  const read = await readBody(request);
  if (!read.ok) return read.response;

  const payload = validatePayload(read.body);
  if (typeof payload === "string") return fail(400, "invalid_payload", payload);
  if (!REGISTRY_KEYS.has(registryKey(payload.type, payload.slug))) return fail(404, "unknown_item", "unknown item");

  const windowStart = Math.floor(now.getTime() / 1000 / RATE_WINDOW_SECONDS);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const key = await clientKey(ip, env.RATE_SALT, now);

  try {
    const clientCount = await countClientRequest(env.DB, key, windowStart);
    if (clientCount > PER_CLIENT_MAX_PER_WINDOW) {
      return fail(429, "rate_limited", "too many install events from this client", { "Retry-After": String(RATE_WINDOW_SECONDS) });
    }
    if ((await countGlobalRequests(env.DB)) >= GLOBAL_MAX_PER_WINDOW) {
      return fail(429, "rate_limited", "too many install events right now", { "Retry-After": String(RATE_WINDOW_SECONDS) });
    }

    // Only the coarse country Cloudflare derives from the request is kept; the IP is not.
    const country = typeof request.cf?.country === "string" ? request.cf.country : "unknown";
    await env.DB.prepare("INSERT INTO installs (slug, item_type, tool, scope, cli_version, country) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(payload.slug, payload.type, payload.tool, payload.scope, payload.version, country)
      .run();
  } catch (error) {
    console.error("installs: D1 failure", error);
    return fail(500, "db_error", "internal error");
  }

  waitUntil(
    deleteExpired(env.DB, windowStart).catch((error: unknown) => {
      console.error("installs: retention delete failed", error);
    })
  );
  return json({ ok: true }, 200);
}

/** Catch-all: POST records an event; every other method gets 405 with Allow. */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (request.method === "POST") return handleInstall(request, env, (promise) => context.waitUntil(promise));
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS", "Cache-Control": "no-store" } });
  }
  return fail(405, "method_not_allowed", `${request.method} is not supported; POST an install event`, { Allow: "POST, OPTIONS" });
};
