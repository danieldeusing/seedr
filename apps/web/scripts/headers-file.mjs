// Parser + matcher for Cloudflare Pages' `_headers` file, following the documented
// semantics (https://developers.cloudflare.com/pages/configuration/headers/):
//   - a block starts with an unindented URL pattern, followed by indented `Name: value` lines
//   - `#` starts a comment
//   - a request matching several blocks inherits all their headers; a header set twice is
//     joined with a comma
//   - `! Name` detaches a header attached by an earlier (more general) block
//   - one `*` splat per pattern matches greedily; `:placeholder` matches everything but `/`
//   - limits: 100 rules, 2,000 characters per line
// Shared by the vite preview plugin (so the built site is served with the real headers),
// the playground checker and the unit tests.

export const MAX_RULES = 100;
export const MAX_LINE_LENGTH = 2000;

/**
 * @typedef {{ pattern: string, headers: { name: string, value: string }[], detach: string[] }} HeaderRule
 */

/**
 * @param {string} text
 * @returns {HeaderRule[]}
 */
export function parseHeadersFile(text) {
  /** @type {HeaderRule[]} */
  const rules = [];
  let current = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (rawLine.length > MAX_LINE_LENGTH) {
      throw new Error(`_headers line ${lineNumber} exceeds ${MAX_LINE_LENGTH} characters`);
    }
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) return;
    if (!/^\s/.test(line)) {
      if (!line.startsWith("/")) throw new Error(`_headers line ${lineNumber}: pattern must start with "/"`);
      if ((line.match(/\*/g) ?? []).length > 1) throw new Error(`_headers line ${lineNumber}: only one splat allowed`);
      current = { pattern: line, headers: [], detach: [] };
      rules.push(current);
      return;
    }
    if (!current) throw new Error(`_headers line ${lineNumber}: header before any pattern`);
    const body = line.trim();
    if (body.startsWith("!")) {
      const name = body.slice(1).trim();
      if (!name) throw new Error(`_headers line ${lineNumber}: empty detach`);
      current.detach.push(name.toLowerCase());
      return;
    }
    const colon = body.indexOf(":");
    if (colon <= 0) throw new Error(`_headers line ${lineNumber}: expected "Name: value"`);
    const name = body.slice(0, colon).trim();
    const value = body.slice(colon + 1).trim();
    if (!/^[A-Za-z0-9-]+$/.test(name)) throw new Error(`_headers line ${lineNumber}: invalid header name "${name}"`);
    if (!value) throw new Error(`_headers line ${lineNumber}: empty value for ${name}`);
    current.headers.push({ name, value });
  });
  if (rules.length > MAX_RULES) throw new Error(`_headers has ${rules.length} rules; the limit is ${MAX_RULES}`);
  return rules;
}

/** @param {string} pattern */
export function patternToRegExp(pattern) {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "[^/]+"))
    .join(".*");
  return new RegExp(`^${source}$`);
}

/**
 * Headers Cloudflare Pages would attach to a request for `path`.
 * @param {HeaderRule[]} rules
 * @param {string} path
 * @returns {[string, string][]}
 */
export function headersFor(rules, path) {
  /** @type {Map<string, { name: string, value: string }>} */
  const result = new Map();
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    for (const name of rule.detach) result.delete(name);
    for (const header of rule.headers) {
      const key = header.name.toLowerCase();
      const existing = result.get(key);
      result.set(key, existing ? { name: existing.name, value: `${existing.value}, ${header.value}` } : header);
    }
  }
  return [...result.values()].map((h) => [h.name, h.value]);
}

/** Parses a Content-Security-Policy value into a directive → sources map. */
export function parseCsp(value) {
  /** @type {Map<string, string[]>} */
  const directives = new Map();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    if (directives.has(name)) throw new Error(`duplicate CSP directive ${name}`);
    directives.set(name, sources);
  }
  return directives;
}

/** The exact text of the one inline `<script>` in index.html (the pre-paint theme gate). */
export function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
