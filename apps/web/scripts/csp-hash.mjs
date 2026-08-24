// The Content-Security-Policy allows exactly one inline script: the pre-paint
// theme gate in index.html. Its hash is what the `script-src` directive carries.
import { createHash } from "node:crypto";
import { inlineScripts, parseCsp, parseHeadersFile } from "./headers-file.mjs";

export function scriptHash(source) {
  return `sha256-${createHash("sha256").update(source, "utf8").digest("base64")}`;
}

/** The hash of the single inline script in an index.html; throws if there isn't exactly one. */
export function inlineScriptHash(html) {
  const scripts = inlineScripts(html);
  if (scripts.length !== 1) throw new Error(`expected exactly one inline <script>, found ${scripts.length}`);
  return scriptHash(scripts[0]);
}

/** The hash(es) the `script-src` directive of the site-wide rule currently lists. */
export function headersScriptHashes(headersText) {
  const rule = parseHeadersFile(headersText).find((r) => r.pattern === "/*");
  const csp = rule?.headers.find((h) => h.name.toLowerCase() === "content-security-policy");
  if (!csp) throw new Error("_headers has no site-wide Content-Security-Policy");
  const scriptSrc = parseCsp(csp.value).get("script-src") ?? [];
  return scriptSrc.filter((source) => source.startsWith("'sha256-")).map((source) => source.slice(1, -1));
}

/** Rewrites the script-src hash in a _headers text to `hash`. */
export function withScriptHash(headersText, hash) {
  return headersText.replace(/'sha256-[A-Za-z0-9+/=]+'/g, `'${hash}'`);
}
