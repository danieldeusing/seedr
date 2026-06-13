interface Env {
  DB: D1Database;
}

const VALID_TOOLS = ["claude", "copilot", "gemini", "codex", "opencode"];
const VALID_TYPES = ["skill", "plugin", "agent", "hook", "mcp", "command", "settings"];
const VALID_SCOPES = ["project", "user", "local"];

interface InstallPayload {
  slug: string;
  type: string;
  tool: string;
  scope: string;
  version: string;
}

function validate(body: unknown): InstallPayload | string {
  if (!body || typeof body !== "object") return "invalid JSON body";

  const { slug, type, tool, scope, version } = body as Record<string, unknown>;

  if (typeof slug !== "string" || slug.length === 0 || slug.length > 100)
    return "slug must be a string (1-100 chars)";
  if (typeof type !== "string" || !VALID_TYPES.includes(type))
    return `type must be one of: ${VALID_TYPES.join(", ")}`;
  if (typeof tool !== "string" || !VALID_TOOLS.includes(tool))
    return `tool must be one of: ${VALID_TOOLS.join(", ")}`;
  if (typeof scope !== "string" || !VALID_SCOPES.includes(scope))
    return `scope must be one of: ${VALID_SCOPES.join(", ")}`;
  if (typeof version !== "string" || version.length === 0 || version.length > 20)
    return "version must be a string (1-20 chars)";

  return { slug, type, tool, scope, version };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json();
    const result = validate(body);

    if (typeof result === "string") {
      return new Response(JSON.stringify({ error: result }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only the coarse country (derived by Cloudflare from the request) is kept —
    // IP addresses are never stored (see privacy policy).
    const country = (context.request.cf?.country as string) ?? "unknown";

    await context.env.DB.prepare(
      "INSERT INTO installs (slug, item_type, tool, scope, cli_version, country) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(result.slug, result.type, result.tool, result.scope, result.version, country)
      .run();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
