#!/usr/bin/env node
/* global console, process */
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
// one package). That is the owner's decision (2026-09-28); the guard in its
// place is a refusal: a release the registry lists no npm provenance attestation
// for is not vendored. pnpm-workspace.yaml has the other half, the React app's
// per-version exemption.
//
// Every run fetches into a fresh, empty npm cache, so what it vendors is what the
// registry answers now, whatever cache or prefer-offline setting the machine has.
//
// Runs before `vite dev` and `vite build` (see package.json). Turbo does not
// cache @seedr/web's build (apps/web/turbo.json): a hit would replay an old
// dist/ without running this. The output folder is generated, not committed.
// The new copy is built in a scratch directory and replaces vendor/ only once
// complete, so a failed run changes nothing and `build` fails. `pnpm dev` passes
// --keep-previous: with a previous copy in place it starts on that one and warns,
// naming the release it kept.
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESIGN = "@danieldeusing/design";
const FONT = "@fontsource-variable/jetbrains-mono";
const keepPrevious = process.argv.includes("--keep-previous");
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(webRoot, "public", "playgrounds", "vendor");
const work = mkdtempSync(join(tmpdir(), "seedr-vendor-"));

// Nothing here may take longer than this: it bounds a connection that hangs instead of failing.
const TIMEOUT_MS = 30_000;
// npm's default is two retries, after 10 s and then 60 s, which made an unreachable registry take 70 s to fail the build.
// An empty cache also holds no "last update check", so npm would advertise its own upgrade on every build.
const NPM_FLAGS = ["--json", "--no-update-notifier", "--fetch-retries=1", "--fetch-retry-mintimeout=1000", "--fetch-retry-maxtimeout=1000"];

function run(program, args) {
  // stderr is piped, not inherited: a failed npm prints a block of its own, and the one message below replaces it.
  // ponytail: no shell, so Windows (npm.cmd) cannot spawn this; the web app is built on macOS and Linux.
  return execFileSync(program, args, { encoding: "utf8", timeout: TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] });
}

/** Runs npm in the empty cache; a failure becomes one message that says what to do about it. */
function npm(positional, extra = []) {
  try {
    return run("npm", [...positional, ...NPM_FLAGS, "--cache", join(work, "npm-cache"), ...extra]);
  } catch (error) {
    let reason = error.code === "ETIMEDOUT" ? `no answer within ${TIMEOUT_MS / 1000} s` : error.message.split("\n")[0];
    try {
      reason = JSON.parse(error.stdout).error.summary;
    } catch {
      /* not npm's --json error body; keep the process error */
    }
    throw new Error(
      `npm ${positional.join(" ")} failed: ${reason}\n` +
        "Reconnect to the npm registry and run it again: a build has no offline copy of the design system to fall back to.",
      { cause: error }
    );
  }
}

/** `npm pack`s one registry spec (npm verifies its integrity) and unpacks it; returns its version, integrity and directory. */
function fetchPackage(spec, npmArgs = []) {
  const packed = JSON.parse(npm(["pack", spec], ["--pack-destination", work, ...npmArgs]))[0];
  const dir = join(work, packed.filename.replace(/\.tgz$/, ""));
  mkdirSync(dir);
  run("tar", ["-xzf", join(work, packed.filename), "-C", dir]);
  return { version: packed.version, integrity: packed.integrity, dir: join(dir, "package") };
}

/** The playgrounds run this package's JavaScript on the site's own origin: only a release CI published with provenance gets in. */
function assertProvenance(spec) {
  // For a release with no attestation, npm prints nothing at all.
  const answer = npm(["view", spec, "dist.attestations"], ["--min-release-age=0"]).trim();
  const predicate = answer ? JSON.parse(answer)?.provenance?.predicateType : undefined;
  if (!String(predicate).startsWith("https://slsa.dev/provenance/")) {
    throw new Error(
      `${spec} is refused: the npm registry lists no provenance attestation for it (dist.attestations). ` +
        "The playgrounds run this package's JavaScript on the site's own origin, so only a release CI published with provenance is vendored."
    );
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
  const design = fetchPackage(`${DESIGN}@latest`, ["--min-release-age=0"]);
  assertProvenance(`${DESIGN}@${design.version}`);
  mkdirSync(join(staged, "fonts"), { recursive: true });
  mkdirSync(join(staged, "runtime"));

  const bundleFile = "danieldeusing-design.min.css";
  const bundle = readFileSync(join(design.dir, "dist", bundleFile), "utf8");
  assertNoRemoteUrl(bundleFile, bundle);
  writeFileSync(join(staged, bundleFile), bundle);

  const fontsSource = readFileSync(join(design.dir, "src", "fonts.css"), "utf8");
  const pinned = [...new Set([...fontsSource.matchAll(cdnFont)].map((match) => match[1]))];
  if (pinned.length !== 1) {
    throw new Error(`design fonts.css should pin one ${FONT} version, found: ${pinned.join(", ") || "none"}`);
  }
  const font = fetchPackage(`${FONT}@${pinned[0]}`);
  const fontFiles = new Set();
  const fontsCss = fontsSource.replace(cdnFont, (_match, _version, fileName) => {
    fontFiles.add(fileName);
    return `./fonts/${fileName}`;
  });
  assertNoRemoteUrl("fonts.css", fontsCss);
  for (const fileName of fontFiles) copyFileSync(join(font.dir, "files", fileName), join(staged, "fonts", fileName));
  writeFileSync(join(staged, "fonts.css"), fontsCss);

  const runtime = readdirSync(join(design.dir, "runtime")).filter((file) => file.endsWith(".js"));
  if (!runtime.includes("index.js")) throw new Error("design package ships no runtime/index.js, which playgrounds/design-init.js imports");
  for (const file of runtime) copyFileSync(join(design.dir, "runtime", file), join(staged, "runtime", file));

  writeFileSync(
    join(staged, "manifest.json"),
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
    return JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"))[DESIGN];
  } catch {
    return undefined;
  }
}

try {
  const staged = join(work, "vendor");
  const summary = build(staged);
  // A local copy, not a rename: the scratch directory is often on another filesystem, where a rename fails.
  // ponytail: not atomic. A copy that dies midway (disk full) leaves a partial vendor/, the build fails, and the next run replaces it.
  rmSync(outDir, { recursive: true, force: true });
  cpSync(staged, outDir, { recursive: true });
  console.log(summary);
} catch (error) {
  const kept = keepPrevious ? previousRelease() : undefined;
  if (kept) {
    console.warn(
      (
        `vendor-playground-assets: ${error.message}\n` +
        `Keeping the previous public/playgrounds/vendor/, which is ${DESIGN}@${kept} and may not be the latest release. ` +
        "`pnpm build` does not do this: it fails."
      ).replace(/^/gm, "WARNING ")
    );
  } else {
    console.error(`vendor-playground-assets: ${error.message}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
