#!/usr/bin/env node
/* global console */
// Self-hosts the design system for the playground pages, so no visitor request
// ever goes to jsDelivr: the CSP in public/_headers is 'self'-only for scripts,
// styles and fonts. On every run it fetches the LATEST published
// @danieldeusing/design from the npm registry (not the version seedr web has
// installed) and vendors into public/playgrounds/vendor/:
//   - dist/danieldeusing-design.min.css, the full bundle;
//   - src/fonts.css, rewritten to local copies of the JetBrains Mono files it
//     pins, fetched by the fontsource version fonts.css itself names;
//   - runtime/*.js, which playgrounds/design-init.js loads (initSelects()).
//
// Every run fetches into a fresh, empty npm cache. npm answers from its cache
// when the registry is unreachable, without a word, so with the shared cache an
// offline run would quietly vendor whatever was latest last time. With an empty
// one, no registry means a failed build, which is the point: never a stale copy.
//
// Runs before `vite dev` and `vite build` (see package.json). The output folder
// is generated, not committed.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(webRoot, "public", "playgrounds", "vendor");
const work = mkdtempSync(join(tmpdir(), "seedr-vendor-"));

/** `npm pack`s one registry spec (npm verifies its integrity) and unpacks it; returns its version and directory. */
function fetchPackage(spec, npmArgs = []) {
  let packed;
  try {
    // An empty cache also holds no "last update check", so npm would advertise its own upgrade on every build.
    const args = ["pack", spec, "--json", "--pack-destination", work, "--cache", join(work, "npm-cache"), "--no-update-notifier", ...npmArgs];
    // ponytail: no shell, so Windows (npm.cmd) cannot spawn this; the web app is built on macOS and Linux.
    packed = JSON.parse(execFileSync("npm", args, { encoding: "utf8" }))[0];
  } catch (error) {
    let reason = error.message.split("\n")[0];
    try {
      reason = JSON.parse(error.stdout).error.summary;
    } catch {
      /* not npm's --json error body; keep the process error */
    }
    throw new Error(
      `npm could not fetch ${spec}: ${reason}\n` +
        "The playgrounds are built from the latest published design system, fetched at build time. There is no offline copy to fall back to.",
      { cause: error }
    );
  }
  const dir = join(work, packed.filename.replace(/\.tgz$/, ""));
  mkdirSync(dir);
  execFileSync("tar", ["-xzf", join(work, packed.filename), "-C", dir]);
  return { version: packed.version, dir: join(dir, "package") };
}

/** No vendored stylesheet may make the browser fetch from another origin. */
function assertNoRemoteUrl(name, css) {
  // A comment may cite a URL and an inline SVG carries its namespace URI; neither is a request.
  const code = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\(\s*(?:"data:[^"]*"|'data:[^']*'|data:[^)]*)\s*\)/g, "");
  if (/cdn\.jsdelivr\.net|https?:|["'(\s]\/\//.test(code)) {
    throw new Error(`vendor/${name} still references a remote URL`);
  }
}

// fonts.css in the design package points at the jsDelivr copy of fontsource.
const cdnFont = /https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource-variable\/jetbrains-mono@([\d.]+)\/files\/([\w-]+\.woff2)/g;

try {
  // Gone before the fetch, so a failed run leaves no previous copy behind to be served.
  rmSync(outDir, { recursive: true, force: true });

  // The design system is first-party: it takes effect the day it is published,
  // so it is exempt from any npm release-age window this machine sets (an npm
  // without that option warns about the flag and has no window to lift).
  const design = fetchPackage("@danieldeusing/design@latest", ["--min-release-age=0"]);
  mkdirSync(join(outDir, "fonts"), { recursive: true });
  mkdirSync(join(outDir, "runtime"));

  const bundleFile = "danieldeusing-design.min.css";
  const bundle = readFileSync(join(design.dir, "dist", bundleFile), "utf8");
  assertNoRemoteUrl(bundleFile, bundle);
  writeFileSync(join(outDir, bundleFile), bundle);

  const fontsSource = readFileSync(join(design.dir, "src", "fonts.css"), "utf8");
  const pinned = [...new Set([...fontsSource.matchAll(cdnFont)].map((match) => match[1]))];
  if (pinned.length !== 1) {
    throw new Error(`design fonts.css should pin one @fontsource-variable/jetbrains-mono version, found: ${pinned.join(", ") || "none"}`);
  }
  const font = fetchPackage(`@fontsource-variable/jetbrains-mono@${pinned[0]}`);
  const fontFiles = new Set();
  const fontsCss = fontsSource.replace(cdnFont, (_match, _version, fileName) => {
    fontFiles.add(fileName);
    return `./fonts/${fileName}`;
  });
  assertNoRemoteUrl("fonts.css", fontsCss);
  for (const fileName of fontFiles) copyFileSync(join(font.dir, "files", fileName), join(outDir, "fonts", fileName));
  writeFileSync(join(outDir, "fonts.css"), fontsCss);

  const runtime = readdirSync(join(design.dir, "runtime")).filter((file) => file.endsWith(".js"));
  if (!runtime.includes("index.js")) throw new Error("design package ships no runtime/index.js, which playgrounds/design-init.js imports");
  for (const file of runtime) copyFileSync(join(design.dir, "runtime", file), join(outDir, "runtime", file));

  writeFileSync(
    join(outDir, "manifest.json"),
    JSON.stringify(
      {
        "@danieldeusing/design": design.version,
        "@fontsource-variable/jetbrains-mono": font.version,
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

  console.log(
    `vendored @danieldeusing/design@${design.version} (latest on npm) + @fontsource-variable/jetbrains-mono@${font.version} ` +
      `into public/playgrounds/vendor/: bundle, fonts.css, ${fontFiles.size} font files, ${runtime.length} runtime modules`
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
