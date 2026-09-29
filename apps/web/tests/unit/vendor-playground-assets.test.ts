// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each case spawns the real script in a scratch copy of apps/web, with a stand-in `npm` first on
// PATH, so nothing touches the network or the real public/playgrounds/vendor/.
vi.setConfig({ testTimeout: 20_000 });

const script = resolve(__dirname, "../../scripts/vendor-playground-assets.mjs");
const PREVIOUS = "previous.txt";
const KEEP_PREVIOUS = "--keep-previous";
const FONT_URL = "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-wght-normal.woff2";
const SLSA = { url: "https://registry.npmjs.org/-/npm/v1/attestations/x", provenance: { predicateType: "https://slsa.dev/provenance/v1" } };
const PUBLISH_ONLY = { url: "https://registry.npmjs.org/-/npm/v1/attestations/x", publish: { predicateType: "https://github.com/npm/attestation/tree/main/specs/publish/v0.1" } };

// What `npm pack` and `npm view` print, as far as the script reads them; behaviour comes from the scenario file.
const FAKE_NPM = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const scenario = JSON.parse(fs.readFileSync(process.env.FAKE_NPM, "utf8"));
const args = process.argv.slice(2);
const refuse = (summary) => {
  console.log(JSON.stringify({ error: { code: "ENOTFOUND", summary } }));
  process.exit(1);
};
if (scenario.offline) refuse("request to https://registry.npmjs.org/ failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org");
if (args[0] === "view") {
  if (scenario.attestations) console.log(JSON.stringify(scenario.attestations, null, 2)); // for a version without any, npm prints nothing
} else if (args[0] === "pack") {
  const release = args[1].startsWith("@danieldeusing/design@") ? scenario.design : scenario.font;
  if (!release) refuse("404 Not Found - " + args[1]);
  const filename = path.basename(release.tarball);
  fs.copyFileSync(release.tarball, path.join(args[args.indexOf("--pack-destination") + 1], filename));
  console.log(JSON.stringify([{ version: release.version, integrity: release.integrity, filename }]));
} else {
  process.exit(2);
}
`;

interface Release {
  tarball: string;
  version: string;
  integrity: string;
}

let root: string;
let vendorDir: string;

/** A `package/` tree tarred the way `npm pack` hands it out. */
function tarball(name: string, files: Record<string, string>): string {
  const staging = mkdtempSync(join(root, "pkg-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(staging, "package", path)), { recursive: true });
    writeFileSync(join(staging, "package", path), body);
  }
  const out = join(root, name);
  execFileSync("tar", ["-czf", out, "-C", staging, "package"]);
  return out;
}

function designRelease(css = ":root{--fg:#111}"): Release {
  return {
    tarball: tarball("design.tgz", {
      "dist/danieldeusing-design.min.css": css,
      "src/fonts.css": `@font-face{font-family:"JetBrains Mono Variable";src:url(${FONT_URL}) format("woff2-variations")}`,
      "runtime/index.js": "export {};",
      "runtime/select.js": "export function initSelects() {}",
    }),
    version: "9.9.9",
    integrity: "sha512-design",
  };
}

const fontRelease = (): Release => ({
  tarball: tarball("font.tgz", { "files/jetbrains-mono-latin-wght-normal.woff2": "woff2" }),
  version: "5.2.8",
  integrity: "sha512-font",
});

interface Scenario {
  design?: Release | null;
  font?: Release | null;
  attestations?: unknown;
  offline?: boolean;
}

/** What the stand-in registry answers: a healthy latest release unless a case overrides part of it. */
function answer({ design = designRelease(), font = fontRelease(), attestations = SLSA, offline = false }: Scenario = {}): void {
  writeFileSync(join(root, "scenario.json"), JSON.stringify({ design, font, attestations, offline }));
}

function vendor(...flags: string[]) {
  return spawnSync(process.execPath, [join(root, "scripts", "vendor-playground-assets.mjs"), ...flags], {
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, PATH: `${join(root, "bin")}${delimiter}${process.env.PATH}`, FAKE_NPM: join(root, "scenario.json") },
  });
}

/** A copy of vendor/ as an earlier run left it. */
function previousCopy(version = "0.58.0"): void {
  mkdirSync(vendorDir, { recursive: true });
  writeFileSync(join(vendorDir, "manifest.json"), JSON.stringify({ "@danieldeusing/design": version }));
  writeFileSync(join(vendorDir, PREVIOUS), "kept");
}

const manifest = (): Record<string, unknown> => JSON.parse(readFileSync(join(vendorDir, "manifest.json"), "utf8"));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "seedr-vendor-test-"));
  vendorDir = join(root, "public", "playgrounds", "vendor");
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, "public", "playgrounds"), { recursive: true });
  copyFileSync(script, join(root, "scripts", "vendor-playground-assets.mjs"));
  writeFileSync(join(root, "bin", "npm"), FAKE_NPM);
  chmodSync(join(root, "bin", "npm"), 0o755);
  answer();
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("what a run vendors, and what it records", () => {
  it("writes the version and the tarball integrity of both packages into manifest.json", () => {
    const run = vendor();
    expect(run.status, run.stderr).toBe(0);
    expect(manifest()).toMatchObject({
      "@danieldeusing/design": "9.9.9",
      "@fontsource-variable/jetbrains-mono": "5.2.8",
      integrity: { "@danieldeusing/design": "sha512-design", "@fontsource-variable/jetbrains-mono": "sha512-font" },
    });
    expect(existsSync(join(vendorDir, "runtime", "index.js"))).toBe(true);
    expect(existsSync(join(vendorDir, "fonts", "jetbrains-mono-latin-wght-normal.woff2"))).toBe(true);
  });

  it("swaps the new copy in whole: nothing of the previous one is left, and no scratch directory", () => {
    previousCopy();
    const run = vendor();
    expect(run.status, run.stderr).toBe(0);
    expect(manifest()["@danieldeusing/design"]).toBe("9.9.9");
    expect(existsSync(join(vendorDir, PREVIOUS))).toBe(false);
    expect(readdirSync(join(root, "public", "playgrounds"))).toEqual(["vendor"]);
  });
});

describe("a release with no npm provenance attestation is refused", () => {
  it.each([
    ["npm prints nothing for it", null],
    ["it lists an attestation URL and no provenance", { url: SLSA.url }],
    ["it lists a publish attestation only", PUBLISH_ONLY],
  ])("%s", (_case, attestations) => {
    answer({ attestations });
    const run = vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("provenance");
    expect(run.stderr).toContain("@danieldeusing/design@9.9.9");
    expect(existsSync(vendorDir)).toBe(false);
  });
});

describe("a failed run", () => {
  it("prints one message and sets the exit code, instead of an uncaught exception", () => {
    answer({ offline: true });
    const run = vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("@danieldeusing/design@latest");
    expect(run.stderr).toContain("ENOTFOUND");
    expect(run.stderr).not.toMatch(/\n\s+at /);
    expect(run.stderr).not.toContain("[cause]");
  });

  it("leaves no half-filled vendor/ when the second fetch fails", () => {
    answer({ font: null });
    const run = vendor();
    expect(run.status).toBe(1);
    expect(existsSync(vendorDir)).toBe(false);
  });

  it("leaves the previous vendor/ as it was", () => {
    previousCopy();
    answer({ font: null });
    const run = vendor();
    expect(run.status).toBe(1);
    expect(readFileSync(join(vendorDir, PREVIOUS), "utf8")).toBe("kept");
    expect(manifest()["@danieldeusing/design"]).toBe("0.58.0");
  });
});

describe("--keep-previous, which is what pnpm dev passes", () => {
  it("keeps the previous copy when the registry is unreachable, and says which release it kept", () => {
    previousCopy("0.58.0");
    answer({ offline: true });
    const run = vendor(KEEP_PREVIOUS);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toContain("@danieldeusing/design@0.58.0");
    expect(readFileSync(join(vendorDir, PREVIOUS), "utf8")).toBe("kept");
  });

  it("still fails when there is no complete previous copy to keep", () => {
    answer({ offline: true });
    expect(vendor(KEEP_PREVIOUS).status).toBe(1);
    mkdirSync(vendorDir, { recursive: true });
    writeFileSync(join(vendorDir, "danieldeusing-design.min.css"), "half a copy, no manifest.json");
    expect(vendor(KEEP_PREVIOUS).status).toBe(1);
  });

  it("fetches normally when the registry answers", () => {
    previousCopy();
    const run = vendor(KEEP_PREVIOUS);
    expect(run.status, run.stderr).toBe(0);
    expect(manifest()["@danieldeusing/design"]).toBe("9.9.9");
  });

  it("is what a build lacks: without it an unreachable registry fails even with a previous copy", () => {
    previousCopy();
    answer({ offline: true });
    expect(vendor().status).toBe(1);
    expect(readFileSync(join(vendorDir, PREVIOUS), "utf8")).toBe("kept");
  });
});

describe("the remote-URL guard", () => {
  it.each(["url(https://cdn.example.test/a.woff2)", "url(HTTPS://cdn.example.test/a.woff2)", "@import Url('Https://cdn.example.test/a.css');", "url(//cdn.example.test/a.woff2)"])(
    "refuses %s",
    (css) => {
      answer({ design: designRelease(`:root{--fg:#111}${css}`) });
      const run = vendor();
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("remote URL");
    }
  );

  it("lets an inline SVG's namespace URI through, whatever case its data: URL is written in", () => {
    const svg = "%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    answer({ design: designRelease(`a{background:url(data:image/svg+xml,${svg})}b{background:URL(DATA:image/svg+xml,${svg})}`) });
    const run = vendor();
    expect(run.status, run.stderr).toBe(0);
  });
});
