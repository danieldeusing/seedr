// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_LINE_LENGTH, MAX_RULES, headersFor, parseCsp, parseHeadersFile } from "../../scripts/headers-file.mjs";
import { headersScriptHashes, inlineScriptHash, withScriptHash } from "../../scripts/csp-hash.mjs";

const webRoot = join(__dirname, "..", "..");
const headersText = readFileSync(join(webRoot, "public", "_headers"), "utf8");
const indexHtml = readFileSync(join(webRoot, "index.html"), "utf8");

describe("public/_headers (production response headers)", () => {
  const rules = parseHeadersFile(headersText);
  const site = Object.fromEntries(headersFor(rules, "/skills/pdf").map(([name, value]) => [name.toLowerCase(), value]));
  const csp = parseCsp(site["content-security-policy"]!);

  it("parses within Cloudflare's limits", () => {
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.length).toBeLessThanOrEqual(MAX_RULES);
    for (const line of headersText.split("\n")) expect(line.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
    expect(rules[0]?.pattern).toBe("/*");
  });

  it("sets every required security header site-wide", () => {
    expect(site["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains; preload");
    expect(site["x-content-type-options"]).toBe("nosniff");
    expect(site["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(site["permissions-policy"]).toContain("camera=()");
    expect(site["permissions-policy"]).toContain("microphone=()");
    expect(site["permissions-policy"]).toContain("geolocation=()");
    // X-Frame-Options cannot express the estate allow-list and would contradict frame-ancestors
    expect(site["x-frame-options"]).toBeUndefined();
  });

  it("keeps the Content-Security-Policy strict", () => {
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("font-src")).toEqual(["'self'"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(csp.get("connect-src")).toEqual(["'self'", "https://raw.githubusercontent.com"]);
    expect(csp.get("worker-src")).toEqual(["'none'"]);
    expect(csp.get("style-src")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'self'", "https://danieldeusing.de", "https://*.danieldeusing.de"]);
    const scriptSrc = csp.get("script-src")!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc.filter((s) => !s.startsWith("'sha256-"))).toEqual(["'self'"]);
  });

  it("allows exactly the inline theme script of index.html, by hash", () => {
    const builtHash = inlineScriptHash(indexHtml);
    expect(headersScriptHashes(headersText)).toEqual([builtHash]);
  });

  it("caches hashed assets forever and the API never", () => {
    const assets = Object.fromEntries(headersFor(rules, "/assets/index-abc123.js"));
    expect(assets["Cache-Control"]).toBe("public, max-age=31536000, immutable");
    expect(assets["Content-Security-Policy"]).toBeDefined();
    const api = Object.fromEntries(headersFor(rules, "/api/installs"));
    expect(api["Cache-Control"]).toBe("no-store");
  });
});

describe("parseHeadersFile semantics", () => {
  it("accumulates matching rules, joins duplicates and honours detach", () => {
    const rules = parseHeadersFile(`
# comment
/*
  X-A: one
  X-B: site
/docs/*
  X-A: two
  ! X-B
/docs/:page
  X-C: page
`);
    expect(headersFor(rules, "/index.html")).toEqual([
      ["X-A", "one"],
      ["X-B", "site"],
    ]);
    expect(headersFor(rules, "/docs/intro")).toEqual([
      ["X-A", "one, two"],
      ["X-C", "page"],
    ]);
    expect(headersFor(rules, "/docs/a/b")).toEqual([["X-A", "one, two"]]);
  });

  it("rejects malformed files", () => {
    expect(() => parseHeadersFile("  X-A: no pattern")).toThrow(/before any pattern/);
    expect(() => parseHeadersFile("/a/*/b/*\n  X: y")).toThrow(/one splat/);
    expect(() => parseHeadersFile("/a\n  broken line")).toThrow(/Name: value/);
    expect(() => parseHeadersFile("/a\n  Bad Name: x")).toThrow(/invalid header name/);
    expect(() => parseHeadersFile(`/a\n  X: ${"y".repeat(MAX_LINE_LENGTH)}`)).toThrow(/exceeds/);
  });
});

describe("csp hash helpers", () => {
  it("rewrites the script-src hash", () => {
    const rewritten = withScriptHash(headersText, "sha256-AAAA");
    expect(headersScriptHashes(rewritten)).toEqual(["sha256-AAAA"]);
  });

  it("refuses templates with more than one inline script", () => {
    expect(() => inlineScriptHash("<script>a</script><script>b</script>")).toThrow(/exactly one/);
    expect(() => inlineScriptHash('<script src="/x.js"></script>')).toThrow(/exactly one/);
  });
});
