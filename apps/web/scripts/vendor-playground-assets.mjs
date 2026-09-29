#!/usr/bin/env node
/* global Buffer, console, process */
// Self-hosts the design system for the playground pages, so no visitor request
// ever goes to jsDelivr: the CSP in public/_headers is 'self'-only for scripts,
// styles and fonts. On every run it fetches the LATEST published
// @danieldeusing/design from the npm registry (not the version seedr web has
// installed) and vendors into public/playgrounds/vendor/:
//   - dist/danieldeusing-design.min.css, the full bundle;
//   - src/fonts.css, rewritten to local copies of the JetBrains Mono files it
//     pins, fetched by the fontsource version fonts.css itself names;
//   - runtime/*.js, which playgrounds/design-init.js loads (initSelects());
//   - manifest.json, the version and tarball integrity of both packages, so the
//     bytes on the site can be traced to a release.
//
// Tracking `latest` puts JavaScript published minutes ago on the site's own
// origin, with no version pin and no release-age window (lifted below for this
// one package). That is the owner's decision (2026-09-28). What stands in for a
// pin is a refusal, decided before anything is extracted: npm's SLSA provenance
// for the release must say the release workflow of danieldeusing-design built it
// (RELEASE below) and must attest the very bytes npm delivered. It reads the
// attestation the registry serves and does not verify its Sigstore signature, so
// it is as strong as the TLS connection to the registry, which the tarball's
// integrity rests on too. What it stops is a stolen npm token publishing from
// another repository's workflow or another branch, with provenance saying so.
// pnpm-workspace.yaml has the other half, the React app's per-version exemption.
//
// Every run fetches into a fresh, empty npm cache, so what it vendors is what the
// registry answers now, whatever cache or prefer-offline setting the machine has.
//
// A person at a terminal wants a fast failure: an unreachable registry ends the
// run in about a second. CI wants to ride out a registry blip, so it keeps npm's
// own retry budget (BUDGET below). npm, curl (which reads the attestation, as npm
// cannot print it) and tar all run with the same bound.
//
// Runs before `vite dev` and `vite build` (see package.json). Turbo does not
// cache @seedr/web's build (apps/web/turbo.json): a hit would replay an old
// dist/ without running this. The output folder is generated, not committed.
// The new copy is built in a scratch directory and replaces vendor/ only once
// complete, so a failed run changes nothing and `build` fails. `pnpm dev` passes
// --keep-previous: with a previous copy in place it starts on that one and warns,
// naming the release it kept. That covers an unreachable registry and nothing
// else: a refusal, a stylesheet that fetches from another origin or a package
// without its runtime fails dev as it fails build.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESIGN = "@danieldeusing/design";
const FONT = "@fontsource-variable/jetbrains-mono";
const SLSA = "https://slsa.dev/provenance/v1";
const MANIFEST = "manifest.json";
// The one workflow that may have built a design release, as npm's SLSA provenance names it.
const RELEASE = { repository: "https://github.com/danieldeusing/danieldeusing-design", path: ".github/workflows/release.yml", ref: "refs/heads/main" };
const keepPrevious = process.argv.includes("--keep-previous");
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(webRoot, "public", "playgrounds", "vendor");
const work = mkdtempSync(join(tmpdir(), "seedr-vendor-"));

// npm's default is two retries, after 10 s and then 60 s: an unreachable registry took 70 s to fail a build, which
// is right for CI and too long for a person. So a terminal gets one retry after a second and a bound of 30 s, which
// also stops a connection that hangs instead of failing. CI keeps npm's retries, curl gets the same amount of
// patience, and the bound is long enough not to cut them short (two 503s in a row cost npm 72 s). curl also gets a time
// limit per attempt, or a stalled connection would hold it until the bound and --retry would never apply: it must be
// well under the bound, times its attempts.
const CI = !["", "0", "false"].includes(process.env.CI ?? "");
const BUDGET = CI
  ? { timeoutMs: 300_000, npm: [], curl: ["--connect-timeout", "10", "--max-time", "30", "--retry", "2", "--retry-delay", "30"] }
  : { timeoutMs: 30_000, npm: ["--fetch-retries=1", "--fetch-retry-mintimeout=1000", "--fetch-retry-maxtimeout=1000"], curl: ["--connect-timeout", "5", "--max-time", "10", "--retry", "1", "--retry-delay", "1"] };
// An empty cache also holds no "last update check", so npm would advertise its own upgrade on every build.
const NPM_FLAGS = ["--json", "--no-update-notifier", ...BUDGET.npm];
// What npm's JSON error body calls a registry that did not answer, as opposed to one that answered "no". A 408 or 429 is
// the registry asking to be tried later, so it counts as not answering, as it does for curl below.
const UNREACHABLE = /^(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|E408|E429|E5\d\d)$/;

/** The registry could not be reached: the one failure `--keep-previous` forgives. */
class Unreachable extends Error {}

function run(program, args, env = {}) {
  // stderr is piped, not inherited: a failed npm prints a block of its own, and the one message below replaces it.
  // ponytail: no shell, so Windows (npm.cmd) cannot spawn this; the web app is built on macOS and Linux.
  return execFileSync(program, args, { encoding: "utf8", timeout: BUDGET.timeoutMs, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
}

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Why a program failed: its code (npm's, when it wrote a JSON error body) and the shortest honest reason. */
function failure(error) {
  if (error.code === "ETIMEDOUT") return { code: "ETIMEDOUT", reason: `no answer within ${BUDGET.timeoutMs / 1000} s` };
  const body = parse(error.stdout)?.error;
  if (body) return { code: body.code, reason: body.summary };
  // No JSON body: npm's last word on stderr, not the pointer to a log in the scratch directory that is deleted after.
  const lines = String(error.stderr ?? "").split("\n").map((line) => line.trim()).filter((line) => line && !line.includes("A complete log of this run"));
  return { code: error.code, reason: lines.at(-1) ?? error.message.split("\n")[0] };
}

const packageOf = (spec) => spec.slice(0, spec.lastIndexOf("@"));
const reconnect = (name) => `Reconnect to the npm registry and run it again: a build has no offline copy of ${name} to fall back to.`;

/** Runs npm in the empty cache; a failure becomes one message, with advice only when the registry is what failed. */
function npm(positional, extra = []) {
  try {
    return run("npm", [...positional, ...NPM_FLAGS, "--cache", join(work, "npm-cache"), ...extra]);
  } catch (error) {
    const { code, reason } = failure(error);
    const message = `npm ${positional.join(" ")} failed: ${reason}`;
    if (!UNREACHABLE.test(code)) throw new Error(message, { cause: error });
    throw new Unreachable(`${message}\n${reconnect(packageOf(positional[1]))}`, { cause: error });
  }
}

/** `npm pack`s one registry spec; npm checks the tarball against the registry's integrity. Nothing is extracted yet. */
function pack(spec, npmArgs = []) {
  const packed = JSON.parse(npm(["pack", spec], ["--pack-destination", work, ...npmArgs]))[0];
  return { version: packed.version, integrity: packed.integrity, file: join(work, packed.filename) };
}

/** Extracts a packed tarball and returns the package directory. */
function unpack({ file }) {
  const dir = file.replace(/\.tgz$/, "");
  mkdirSync(dir);
  try {
    run("tar", ["-xzf", file, "-C", dir]);
  } catch (error) {
    throw new Error(`tar could not unpack ${basename(file)}: ${failure(error).reason}`, { cause: error });
  }
  return join(dir, "package");
}

/**
 * curl reads HTTPS_PROXY but not npm's own proxy settings (.npmrc, npm_config_*), so hand it npm's, unless HTTPS_PROXY is set.
 * Through curl's environment and not --proxy: an argument shows in `ps` with any credentials in the URL, and curl
 * applies NO_PROXY to an environment proxy.
 */
function proxyEnv() {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) return {};
  try {
    const config = parse(npm(["config", "list"]));
    const proxy = config?.["https-proxy"] || config?.proxy;
    return typeof proxy === "string" && proxy ? { HTTPS_PROXY: proxy } : {};
  } catch {
    return {}; // no proxy is a guess, and curl says so loudly if the guess was wrong
  }
}

/** The attestation bundles the registry serves at `url`. curl, because npm has no command that prints them. */
function attestationsAt(url, spec) {
  try {
    return run("curl", ["--silent", "--show-error", "--fail", "--globoff", "--proto", "=https", ...BUDGET.curl, "--url", url], proxyEnv());
  } catch (error) {
    // Not the registry's fault, so never forgiven: there is no curl to ask with.
    if (error.code === "ENOENT") throw new Error(`curl is required to read the attestation of ${spec}, and it is not on PATH`, { cause: error });
    const { reason } = failure(error);
    const message = `could not read the attestation of ${spec} at ${url}: ${reason}`;
    // curl exits 22 for any HTTP error. A 4xx is the registry answering "no", like npm's E404; only no answer or a 5xx is unreachable.
    if (/error: (?!408|429)4\d\d/.test(reason)) throw new Error(message, { cause: error });
    throw new Unreachable(`${message}\n${reconnect(packageOf(spec))}`, { cause: error });
  }
}

/** The SLSA provenance statement inside a bundle, or undefined when it is not there or cannot be read. */
function slsaStatement(bundles) {
  const entries = parse(bundles)?.attestations;
  const payload = Array.isArray(entries) ? entries.find((entry) => entry?.predicateType === SLSA)?.bundle?.dsseEnvelope?.payload : undefined;
  return typeof payload === "string" ? parse(Buffer.from(payload, "base64").toString("utf8")) : undefined;
}

/** The playgrounds run this package's JavaScript on the site's own origin: only what the release workflow built gets in. */
function assertProvenance(spec, file) {
  const refuse = (why) =>
    new Error(
      `${spec} is refused: ${why}. The playgrounds run this package's JavaScript on the site's own origin, ` +
        "so only what the release workflow of danieldeusing-design built is vendored."
    );
  // For a release with no attestation, npm prints nothing at all.
  const listed = parse(npm(["view", spec, "dist.attestations"], ["--min-release-age=0"]).trim());
  if (listed?.provenance?.predicateType !== SLSA) throw refuse("the npm registry lists no provenance attestation for it");
  if (!String(listed.url).startsWith("https://")) throw refuse("its provenance attestation is not served over https");
  const statement = slsaStatement(attestationsAt(listed.url, spec));
  if (!statement) throw refuse("its provenance attestation cannot be read");
  const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow;
  for (const [what, got, wanted] of [
    ["predicate type", statement.predicateType, SLSA],
    ["repository", workflow?.repository, RELEASE.repository],
    ["workflow path", workflow?.path, RELEASE.path],
    ["ref", workflow?.ref, RELEASE.ref],
  ]) {
    if (got !== wanted) throw refuse(`its provenance names ${what} ${got}, not ${wanted}`);
  }
  const digest = createHash("sha512").update(readFileSync(file)).digest("hex");
  if (!Array.isArray(statement.subject) || !statement.subject.some((subject) => subject?.digest?.sha512 === digest)) {
    throw refuse("its provenance attests other bytes than the tarball npm delivered");
  }
}

/** No vendored stylesheet may make the browser fetch from another origin. */
function assertNoRemoteUrl(name, css) {
  // A comment may cite a URL and an inline SVG carries its namespace URI; neither is a request.
  // Scheme and function names are case-insensitive in CSS: url(HTTPS://…) fetches like url(https://…).
  const code = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\(\s*(?:"data:[^"]*"|'data:[^']*'|data:[^)]*)\s*\)/gi, "");
  if (/cdn\.jsdelivr\.net|https?:|["'(\s]\/\//i.test(code)) {
    throw new Error(`vendor/${name} still references a remote URL`);
  }
}

// fonts.css in the design package points at the jsDelivr copy of fontsource.
const cdnFont = /https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource-variable\/jetbrains-mono@([\d.]+)\/files\/([\w-]+\.woff2)/g;

/** Builds the whole vendor/ tree in `staged`, and returns what to log; it throws before anything of it reaches public/. */
function build(staged) {
  // The design system is first-party: it takes effect the day it is published,
  // so it is exempt from any npm release-age window this machine sets (an npm
  // without that option warns about the flag and has no window to lift).
  const design = pack(`${DESIGN}@latest`, ["--min-release-age=0"]);
  assertProvenance(`${DESIGN}@${design.version}`, design.file);
  const designDir = unpack(design);
  mkdirSync(join(staged, "fonts"), { recursive: true });
  mkdirSync(join(staged, "runtime"));

  const bundleFile = "danieldeusing-design.min.css";
  const bundle = readFileSync(join(designDir, "dist", bundleFile), "utf8");
  assertNoRemoteUrl(bundleFile, bundle);
  writeFileSync(join(staged, bundleFile), bundle);

  const fontsSource = readFileSync(join(designDir, "src", "fonts.css"), "utf8");
  const pinned = [...new Set([...fontsSource.matchAll(cdnFont)].map((match) => match[1]))];
  if (pinned.length !== 1) {
    throw new Error(`design fonts.css should pin one ${FONT} version, found: ${pinned.join(", ") || "none"}`);
  }
  const font = pack(`${FONT}@${pinned[0]}`);
  const fontDir = unpack(font);
  const fontFiles = new Set();
  const fontsCss = fontsSource.replace(cdnFont, (_match, _version, fileName) => {
    fontFiles.add(fileName);
    return `./fonts/${fileName}`;
  });
  assertNoRemoteUrl("fonts.css", fontsCss);
  for (const fileName of fontFiles) copyFileSync(join(fontDir, "files", fileName), join(staged, "fonts", fileName));
  writeFileSync(join(staged, "fonts.css"), fontsCss);

  const runtimeDir = join(designDir, "runtime");
  const runtime = existsSync(runtimeDir) ? readdirSync(runtimeDir).filter((file) => file.endsWith(".js")) : [];
  if (!runtime.includes("index.js")) throw new Error("design package ships no runtime/index.js, which playgrounds/design-init.js imports");
  for (const file of runtime) copyFileSync(join(runtimeDir, file), join(staged, "runtime", file));

  writeFileSync(
    join(staged, MANIFEST),
    JSON.stringify(
      {
        [DESIGN]: design.version,
        [FONT]: font.version,
        integrity: { [DESIGN]: design.integrity, [FONT]: font.integrity },
        files: [
          bundleFile,
          "fonts.css",
          ...[...fontFiles].map((file) => `fonts/${file}`),
          ...runtime.map((file) => `runtime/${file}`),
        ],
      },
      null,
      2
    ) + "\n"
  );

  return (
    `vendored ${DESIGN}@${design.version} (latest on npm) + ${FONT}@${font.version} ` +
    `into public/playgrounds/vendor/: bundle, fonts.css, ${fontFiles.size} font files, ${runtime.length} runtime modules`
  );
}

/** The design release of the copy already in vendor/; undefined when there is no complete copy (manifest.json is what marks one). */
function previousRelease() {
  try {
    return parse(readFileSync(join(outDir, MANIFEST), "utf8"))?.[DESIGN];
  } catch {
    return undefined;
  }
}

/** Replaces vendor/ with the finished copy in `staged`. */
function swap(staged) {
  const manifest = join(staged, MANIFEST);
  rmSync(outDir, { recursive: true, force: true });
  // A local copy, not a rename: the scratch directory is often on another filesystem, where a rename fails.
  // manifest.json goes in last, because it is what marks a copy complete: one killed midway does not look like one.
  // ponytail: not atomic. A copy that dies midway (disk full) leaves a partial vendor/, the build fails, and the next run replaces it.
  cpSync(staged, outDir, { recursive: true, filter: (source) => source !== manifest });
  copyFileSync(manifest, join(outDir, MANIFEST));
}

// Read before anything touches vendor/, so it is the copy that is really there.
const previous = keepPrevious ? previousRelease() : undefined;
try {
  const staged = join(work, "vendor");
  const summary = build(staged);
  swap(staged);
  console.log(summary);
} catch (error) {
  if (previous && error instanceof Unreachable) {
    console.warn(
      (
        `vendor-playground-assets: ${error.message}\n` +
        `Keeping the previous public/playgrounds/vendor/, which is ${DESIGN}@${previous} and may not be the latest release. ` +
        "`pnpm build` does not do this: it fails."
      ).replace(/^/gm, "WARNING ")
    );
  } else {
    console.error(`vendor-playground-assets: ${error.message}`);
    if (previous) console.error(`--keep-previous forgives an unreachable registry only, so the previous copy (${DESIGN}@${previous}) is not used.`);
    process.exitCode = 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
