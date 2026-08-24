// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  GLOBAL_MAX_PER_WINDOW,
  MAX_BODY_BYTES,
  PER_CLIENT_MAX_PER_WINDOW,
  clientKey,
  handleInstall,
  onRequest,
  validatePayload,
  type Env,
} from "./installs";
import { REGISTRY_KEYS } from "../registry-keys.generated";

interface Call {
  sql: string;
  values: unknown[];
}

/** In-memory stand-in for D1: routes each statement by its SQL, records every call. */
class FakeDB {
  calls: Call[] = [];
  batches: Call[][] = [];
  clientCount = 0;
  globalCount = 0;
  failWith: Error | null = null;

  prepare(sql: string) {
    const call: Call = { sql, values: [] };
    const statement = {
      bind: (...values: unknown[]) => {
        call.values = values;
        return statement;
      },
      first: async <T,>(): Promise<T | null> => {
        this.calls.push(call);
        if (this.failWith) throw this.failWith;
        if (sql.includes("INSERT INTO rate_limits")) {
          this.clientCount += 1;
          return { count: this.clientCount } as T;
        }
        if (sql.includes("SELECT COUNT(*)")) return { n: this.globalCount } as T;
        return null;
      },
      run: async () => {
        this.calls.push(call);
        if (this.failWith) throw this.failWith;
        return { success: true, meta: {} };
      },
      all: async () => {
        this.calls.push(call);
        return { results: [], success: true, meta: {} };
      },
      call,
    };
    return statement;
  }

  async batch(statements: { call: Call }[]) {
    this.batches.push(statements.map((s) => s.call));
    return statements.map(() => ({ success: true, meta: {} }));
  }
}

const KNOWN = [...REGISTRY_KEYS][0]!.split("/") as [string, string];
const VALID = { slug: KNOWN[1], type: KNOWN[0], tool: "claude", scope: "project", version: "0.1.87" };

function env(db: FakeDB, salt?: string): Env {
  return { DB: db as unknown as D1Database, RATE_SALT: salt };
}

function post(body: unknown, headers: Record<string, string> = {}, cf?: Record<string, unknown>): Request {
  const request = new Request("https://seedr.danieldeusing.de/api/installs", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  if (cf) Object.defineProperty(request, "cf", { value: cf });
  return request;
}

async function run(request: Request, db = new FakeDB(), salt?: string) {
  const scheduled: Promise<unknown>[] = [];
  const response = await handleInstall(request, env(db, salt), (promise) => scheduled.push(promise), new Date("2026-08-23T10:00:30Z"));
  await Promise.all(scheduled);
  return { response, db, body: (await response.json()) as Record<string, unknown>, scheduled };
}

describe("POST /api/installs", () => {
  it("records a valid event with the coarse country and schedules the retention delete", async () => {
    const { response, db, body } = await run(post(VALID, {}, { country: "DE" }));
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");

    const insert = db.calls.find((c) => c.sql.startsWith("INSERT INTO installs"));
    expect(insert?.values).toEqual([VALID.slug, VALID.type, "claude", "project", "0.1.87", "DE"]);

    const rateLimit = db.calls.find((c) => c.sql.includes("INSERT INTO rate_limits"));
    expect(rateLimit?.values[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(rateLimit?.values[1]).toBe(Math.floor(Date.parse("2026-08-23T10:00:30Z") / 1000 / 60));

    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]?.map((c) => c.sql.replace(/\s+/g, " "))).toEqual([
      expect.stringContaining("DELETE FROM installs WHERE id IN ( SELECT id FROM installs WHERE installed_at < datetime('now', ?1) LIMIT ?2 )"),
      expect.stringContaining("DELETE FROM rate_limits WHERE window_start < ?1"),
    ]);
    expect(db.batches[0]?.[0]?.values).toEqual(["-90 days", 200]);
  });

  it("never stores or binds the client IP", async () => {
    const { db } = await run(post(VALID));
    const bound = db.calls.flatMap((c) => c.values).concat(db.batches.flat().flatMap((c) => c.values));
    expect(JSON.stringify(bound)).not.toContain("203.0.113.9");
  });

  it("defaults the country to unknown when Cloudflare provides none", async () => {
    const { db } = await run(post(VALID));
    expect(db.calls.find((c) => c.sql.startsWith("INSERT INTO installs"))?.values[5]).toBe("unknown");
  });

  it("rejects fabricated items with 404 before touching the database", async () => {
    const { response, db, body } = await run(post({ ...VALID, slug: "definitely-not-in-the-registry" }));
    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "unknown item", code: "unknown_item" });
    expect(db.calls).toEqual([]);
  });

  it("rejects a real slug under the wrong type", async () => {
    const otherType = VALID.type === "skill" ? "hook" : "skill";
    const { response } = await run(post({ ...VALID, type: otherType }));
    expect(response.status).toBe(404);
  });

  it("rejects malformed JSON with 400", async () => {
    const { response, body, db } = await run(post("{not json"));
    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "body is not valid JSON", code: "bad_json" });
    expect(db.calls).toEqual([]);
  });

  it("rejects invalid payloads with 400 and a reason", async () => {
    expect((await run(post({ ...VALID, tool: "vim" }))).response.status).toBe(400);
    expect((await run(post({ ...VALID, tool: "vim" }))).body.code).toBe("invalid_payload");
    expect((await run(post([1, 2, 3]))).body).toEqual({ error: "body must be a JSON object", code: "invalid_payload" });
    expect((await run(post({ ...VALID, slug: "../etc" }))).response.status).toBe(400);
    expect((await run(post({ ...VALID, scope: "global" }))).response.status).toBe(400);
    expect((await run(post({ ...VALID, version: "x".repeat(21) }))).response.status).toBe(400);
  });

  it("rejects oversized bodies with 413, by header and by actual size", async () => {
    const byHeader = await run(post(VALID, { "content-length": String(MAX_BODY_BYTES + 1) }));
    expect(byHeader.response.status).toBe(413);
    expect(byHeader.body.code).toBe("payload_too_large");

    const bySize = await run(post({ ...VALID, padding: "x".repeat(MAX_BODY_BYTES) }));
    expect(bySize.response.status).toBe(413);
    expect(bySize.db.calls).toEqual([]);
  });

  it("limits a single client to PER_CLIENT_MAX_PER_WINDOW events per window", async () => {
    const db = new FakeDB();
    const statuses: number[] = [];
    for (let i = 0; i < PER_CLIENT_MAX_PER_WINDOW + 3; i++) {
      statuses.push((await run(post(VALID), db)).response.status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(PER_CLIENT_MAX_PER_WINDOW);
    expect(statuses.slice(PER_CLIENT_MAX_PER_WINDOW)).toEqual([429, 429, 429]);
    const inserts = db.calls.filter((c) => c.sql.startsWith("INSERT INTO installs"));
    expect(inserts).toHaveLength(PER_CLIENT_MAX_PER_WINDOW);
  });

  it("answers a burst of concurrent requests with exactly the allowed number of successes", async () => {
    const db = new FakeDB();
    const results = await Promise.all(Array.from({ length: PER_CLIENT_MAX_PER_WINDOW + 10 }, () => run(post(VALID), db)));
    const statuses = results.map((r) => r.response.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(PER_CLIENT_MAX_PER_WINDOW);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
    const limited = results.find((r) => r.response.status === 429)!;
    expect(limited.body).toEqual({ error: "too many install events from this client", code: "rate_limited" });
    expect(limited.response.headers.get("retry-after")).toBe("60");
  });

  it("keeps the global cap", async () => {
    const db = new FakeDB();
    db.globalCount = GLOBAL_MAX_PER_WINDOW;
    const { response, body } = await run(post(VALID), db);
    expect(response.status).toBe(429);
    expect(body.code).toBe("rate_limited");
    expect(db.calls.some((c) => c.sql.startsWith("INSERT INTO installs"))).toBe(false);
  });

  it("answers 500 with a generic error when D1 fails", async () => {
    const db = new FakeDB();
    db.failWith = new Error("D1_ERROR: no such table: rate_limits");
    const { response, body } = await run(post(VALID), db);
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "internal error", code: "db_error" });
  });

  it("hashes the client with the daily salt, differently per day and per salt", async () => {
    const monday = new Date("2026-08-24T01:00:00Z");
    const tuesday = new Date("2026-08-25T01:00:00Z");
    const a = await clientKey("203.0.113.9", undefined, monday);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await clientKey("203.0.113.9", undefined, monday)).toBe(a);
    expect(await clientKey("203.0.113.9", undefined, tuesday)).not.toBe(a);
    expect(await clientKey("203.0.113.9", "pepper", monday)).not.toBe(a);
    expect(await clientKey("203.0.113.10", undefined, monday)).not.toBe(a);
  });
});

describe("onRequest (method routing)", () => {
  const context = (request: Request) =>
    ({ request, env: env(new FakeDB()), waitUntil: () => {}, params: {}, data: {} }) as unknown as Parameters<typeof onRequest>[0];

  it.each(["GET", "PUT", "DELETE", "PATCH", "HEAD"])("answers %s with 405 and Allow", async (method) => {
    const response = await onRequest(context(new Request("https://seedr.danieldeusing.de/api/installs", { method })));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    expect(response.headers.get("content-type")).toBe("application/json");
    if (method !== "HEAD") {
      expect(await response.json()).toEqual({ error: `${method} is not supported; POST an install event`, code: "method_not_allowed" });
    }
  });

  it("answers OPTIONS with 204", async () => {
    const response = await onRequest(context(new Request("https://seedr.danieldeusing.de/api/installs", { method: "OPTIONS" })));
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("routes POST to the handler", async () => {
    const response = await onRequest(context(post(VALID)));
    expect(response.status).toBe(200);
  });
});

describe("validatePayload", () => {
  it("accepts the CLI's shape and nothing looser", () => {
    expect(validatePayload(VALID)).toEqual(VALID);
    expect(validatePayload(null)).toBe("body must be a JSON object");
    expect(validatePayload({ ...VALID, slug: "" })).toMatch(/slug/);
    expect(validatePayload({ ...VALID, slug: "Has Space" })).toMatch(/slug/);
    expect(validatePayload({ ...VALID, type: "theme" })).toMatch(/type/);
    expect(validatePayload({ ...VALID, version: "" })).toMatch(/version/);
  });
});
