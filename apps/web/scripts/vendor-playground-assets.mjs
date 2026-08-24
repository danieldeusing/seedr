#!/usr/bin/env node
/* global console */
// Self-hosts the design-system assets the playground pages use, so no visitor
// request ever goes to jsDelivr. Copies the exact files from the installed
// @danieldeusing/design package (tokens/base/components CSS) and the JetBrains
// Mono variable font subsets from @fontsource-variable/jetbrains-mono into
// public/playgrounds/vendor/, pinned to the installed versions.
//
// Runs before `vite dev` and `vite build` (see package.json). The output folder
// is generated, not committed.
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(webRoot, "public", "playgrounds", "vendor");

const designDir = dirname(require.resolve("@danieldeusing/design/package.json"));
const designVersion = JSON.parse(readFileSync(join(designDir, "package.json"), "utf8")).version;
const fontDir = dirname(require.resolve("@fontsource-variable/jetbrains-mono/package.json"));
const fontVersion = JSON.parse(readFileSync(join(fontDir, "package.json"), "utf8")).version;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "fonts"), { recursive: true });

for (const file of ["tokens.css", "base.css", "components.css"]) {
  copyFileSync(join(designDir, "src", file), join(outDir, file));
}

// fonts.css in the design package points at the jsDelivr copy of fontsource;
// rewrite every font URL to the local copy and copy the referenced files.
const cdnFont = /https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource-variable\/jetbrains-mono@([\d.]+)\/files\/([\w-]+\.woff2)/g;
const copiedFonts = new Set();
const fontsCss = readFileSync(join(designDir, "src", "fonts.css"), "utf8").replace(
  cdnFont,
  (_match, pinnedVersion, fileName) => {
    if (pinnedVersion !== fontVersion) {
      throw new Error(
        `fonts.css pins @fontsource-variable/jetbrains-mono@${pinnedVersion} but ${fontVersion} is installed`
      );
    }
    if (!copiedFonts.has(fileName)) {
      copyFileSync(join(fontDir, "files", fileName), join(outDir, "fonts", fileName));
      copiedFonts.add(fileName);
    }
    return `./fonts/${fileName}`;
  }
);
if (/cdn\.jsdelivr\.net|https?:\/\//.test(fontsCss)) {
  throw new Error("vendor/fonts.css still references a remote URL");
}
writeFileSync(join(outDir, "fonts.css"), fontsCss);

writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify(
    {
      "@danieldeusing/design": designVersion,
      "@fontsource-variable/jetbrains-mono": fontVersion,
      files: ["tokens.css", "base.css", "components.css", "fonts.css", ...[...copiedFonts].map((f) => `fonts/${f}`)],
    },
    null,
    2
  ) + "\n"
);

console.log(
  `vendored @danieldeusing/design@${designVersion} + jetbrains-mono@${fontVersion} (${copiedFonts.size} font files) into public/playgrounds/vendor/`
);
