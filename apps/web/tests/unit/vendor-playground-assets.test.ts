// @vitest-environment node
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it, vi } from "vitest";

// Each case spawns the real script in its own scratch copy of apps/web, and the cases run side by side. A stand-in
// `npm` and `curl` (shell scripts that print what the case put in place) come first on PATH, so nothing touches the
// network or the real public/playgrounds/vendor/. A preload records every program the script starts, with the
// timeout it gave it, which is how the retry flags and the bounds are checked without waiting 30 s for a hang.
vi.setConfig({ testTimeout: 30_000 });

const script = resolve(__dirname, "../../scripts/vendor-playground-assets.mjs");
const PREVIOUS = "previous.txt";
const MANIFEST = "manifest.json";
const DESIGN_SLOT = "pack-design";
const KEEP_PREVIOUS = "--keep-previous";
const FONT_URL = "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.2.8/files/jetbrains-mono-latin-wght-normal.woff2";
const SLSA = "https://slsa.dev/provenance/v1";
const SLSA_V2 = "https://slsa.dev/provenance/v2";
const PUBLISH = "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
const REPOSITORY = "https://github.com/danieldeusing/danieldeusing-design";
const WORKFLOW = ".github/workflows/release.yml";
const REF = "refs/heads/main";
const LISTED = { url: "https://registry.example.test/-/npm/v1/attestations/design@9.9.9", provenance: { predicateType: SLSA } };
const DESIGN_PACKAGE = "@danieldeusing/design";
const FONT_PACKAGE = "@fontsource-variable/jetbrains-mono";
const OTHER_REPOSITORY = "https://github.com/someone-else/danieldeusing-design";
const NO_SUCH_HOST = "request to https://registry.npmjs.org/ failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org";

// Both answer from files the case wrote into $FAKE_DATA: <slot>.out (stdout), .err (stderr), .status, and for a pack
// the tarball as .tgz with its file name in .name.
const FAKE_NPM = `#!/bin/sh
case "$1" in
  view) slot=view ;;
  config) slot=config ;;
  pack) case "$2" in @danieldeusing/design@*) slot=pack-design ;; *) slot=pack-font ;; esac ;;
  *) exit 2 ;;
esac
dest=""
prev=""
for arg in "$@"; do
  [ "$prev" = "--pack-destination" ] && dest="$arg"
  prev="$arg"
done
[ -f "$FAKE_DATA/$slot.tgz" ] && cp "$FAKE_DATA/$slot.tgz" "$dest/$(cat "$FAKE_DATA/$slot.name")"
[ -f "$FAKE_DATA/$slot.err" ] && cat "$FAKE_DATA/$slot.err" >&2
[ -f "$FAKE_DATA/$slot.out" ] && cat "$FAKE_DATA/$slot.out"
exit "$(cat "$FAKE_DATA/$slot.status" 2>/dev/null || echo 0)"
`;

const FAKE_CURL = `#!/bin/sh
[ -f "$FAKE_DATA/curl.err" ] && cat "$FAKE_DATA/curl.err" >&2
[ -f "$FAKE_DATA/curl.out" ] && cat "$FAKE_DATA/curl.out"
exit "$(cat "$FAKE_DATA/curl.status" 2>/dev/null || echo 0)"
`;

// Loaded with -r before the script: logs every program it starts, can make curl missing, and can make the last copy into vendor/ fail.
const SPY = `const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const execFileSync = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  fs.appendFileSync(process.env.CALLS, JSON.stringify({ file, args, timeout: options && options.timeout }) + "\\n");
  if (file === "curl" && process.env.NO_CURL) throw Object.assign(new Error("spawnSync curl ENOENT"), { code: "ENOENT", errno: -2, syscall: "spawnSync curl" });
  return execFileSync(file, args, options);
};
const copyFileSync = fs.copyFileSync;
fs.copyFileSync = (source, destination, ...rest) => {
  if (process.env.FAIL_MANIFEST_COPY && path.basename(destination) === "manifest.json" && destination.includes(path.join("playgrounds", "vendor"))) {
    throw new Error("ENOSPC: no space left on device (the test made this copy fail)");
  }
  return copyFileSync(source, destination, ...rest);
};
require("node:module").syncBuiltinESMExports();
`;

// One directory of stand-ins for every case, written once: the first exec of a new executable costs macOS ~170 ms,
// which is most of a case's time when each case writes its own. What a case answers is in its own $FAKE_DATA.
const fakeBin = mkdtempSync(join(tmpdir(), "seedr-vendor-fakes-"));
for (const [name, body] of Object.entries({ npm: FAKE_NPM, curl: FAKE_CURL })) writeFileSync(join(fakeBin, name), body, { mode: 0o755 });
afterAll(() => rmSync(fakeBin, { recursive: true, force: true }));

interface Release {
  tarball: string;
  version: string;
  integrity: string;
}

interface Attested {
  repository?: string;
  path?: string;
  ref?: string;
  type?: string; // the predicate type inside the signed statement
  entryType?: string; // the one the bundle lists it under
  digest?: string;
}

interface Scenario {
  design?: Release;
  font?: Release | null; // null: the registry has no such package
  attestations?: unknown; // what `npm view … dist.attestations` prints; null is npm's silence
  attested?: Attested;
  bundle?: unknown; // what curl prints instead of the generated bundle
  offline?: boolean; // every npm call fails: no such host
  fontOffline?: boolean; // only the font package cannot be reached
  packError?: { code: string; summary: string }; // the design package cannot be packed, for a reason that is not the network
  npmConfig?: Record<string, string> | null; // what `npm config list` prints; null: it fails
  crash?: string; // npm dies with this on stderr and no JSON body
  curlFails?: number; // the HTTP status the attestation URL answers with
  failManifestCopy?: boolean;
  noCurl?: boolean; // there is no curl on PATH
}

interface Slot {
  out?: string;
  err?: string;
  status?: number;
  tarball?: string;
}

interface Call {
  file: string;
  args: string[];
  timeout?: number;
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

const PROXY = "http://proxy.test:3128";
const PLAIN_PROXY = "http://plain.test:3128";
const NPM_SLOTS = ["view", DESIGN_SLOT, "pack-font"];
const npmError = (code: string, summary: string) => `${JSON.stringify({ error: { code, summary } })}\n`;

/** One scratch copy of apps/web with the stand-in registry beside it. */
function makeHarness() {
  const root = mkdtempSync(join(tmpdir(), "seedr-vendor-test-"));
  const vendorDir = join(root, "public", "playgrounds", "vendor");
  const data = join(root, "data");
  const callsFile = join(root, "calls.jsonl");
  for (const dir of ["scripts", "tmp", join("public", "playgrounds")]) mkdirSync(join(root, dir), { recursive: true });
  copyFileSync(script, join(root, "scripts", "vendor-playground-assets.mjs"));
  writeFileSync(join(root, "spy.cjs"), SPY);
  let answered = false;
  let failManifestCopy = false;
  let noCurl = false;

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

  function designRelease({ css = ":root{--fg:#111}", runtime = ["index.js", "select.js"] }: { css?: string; runtime?: string[] } = {}): Release {
    return {
      tarball: tarball("design.tgz", {
        "dist/danieldeusing-design.min.css": css,
        "src/fonts.css": `@font-face{font-family:"JetBrains Mono Variable";src:url(${FONT_URL}) format("woff2-variations")}`,
        ...Object.fromEntries(runtime.map((file) => [`runtime/${file}`, "export {};"])),
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

  /** What the registry serves for a release: npm's publish attestation, and the SLSA provenance, as the bundle JSON. */
  function bundleFor(sha512: string, { repository = REPOSITORY, path = WORKFLOW, ref = REF, type = SLSA, entryType = SLSA, digest = sha512 }: Attested = {}) {
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      subject: [{ name: "pkg:npm/%40danieldeusing/design@9.9.9", digest: { sha512: digest } }],
      predicateType: type,
      predicate: { buildDefinition: { externalParameters: { workflow: { repository, path, ref } } } },
    };
    const entry = (predicateType: string, body: unknown) => ({ predicateType, bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(body)).toString("base64") } } });
    return { attestations: [entry(PUBLISH, { predicateType: PUBLISH }), entry(entryType, statement)] };
  }

  /** Puts in place what one stand-in command prints, replacing what it printed before. */
  function slot(name: string, { out, err, status, tarball: file }: Slot): void {
    for (const extension of ["out", "err", "status", "tgz", "name"]) rmSync(join(data, `${name}.${extension}`), { force: true });
    if (out !== undefined) writeFileSync(join(data, `${name}.out`), out);
    if (err !== undefined) writeFileSync(join(data, `${name}.err`), err);
    if (status) writeFileSync(join(data, `${name}.status`), String(status));
    if (file) {
      copyFileSync(file, join(data, `${name}.tgz`));
      writeFileSync(join(data, `${name}.name`), basename(file));
    }
  }

  /** What the stand-in registry answers: a healthy latest release, attested by the release workflow, unless a case overrides part of it. */
  function answer({ design = designRelease(), font = fontRelease(), attestations = LISTED, attested, bundle, ...faults }: Scenario = {}): void {
    mkdirSync(data, { recursive: true });
    const sha512 = createHash("sha512").update(readFileSync(design.tarball)).digest("hex");
    const packed = (release: Release) => `${JSON.stringify([{ version: release.version, integrity: release.integrity, filename: basename(release.tarball) }])}\n`;
    slot("view", { out: attestations ? `${JSON.stringify(attestations, null, 2)}\n` : undefined });
    slot(DESIGN_SLOT, { out: packed(design), tarball: design.tarball });
    slot("pack-font", font ? { out: packed(font), tarball: font.tarball } : { out: npmError("E404", `404 Not Found - GET https://registry.npmjs.org/${FONT_PACKAGE}`), status: 1 });
    slot("config", faults.npmConfig === null ? { out: npmError("ECONFIG", "no config"), status: 1 } : { out: `${JSON.stringify(faults.npmConfig ?? {})}\n` });
    slot("curl", { out: typeof bundle === "string" ? bundle : JSON.stringify(bundle ?? bundleFor(sha512, attested)) });
    if (faults.fontOffline) slot("pack-font", { out: npmError("ENOTFOUND", NO_SUCH_HOST), status: 1 });
    if (faults.packError) slot(DESIGN_SLOT, { out: npmError(faults.packError.code, faults.packError.summary), status: 1 });
    for (const name of faults.offline ? NPM_SLOTS : []) slot(name, { out: npmError("ENOTFOUND", NO_SUCH_HOST), status: 1 });
    for (const name of faults.crash ? NPM_SLOTS : []) slot(name, { err: faults.crash, status: 1 });
    if (faults.curlFails) slot("curl", { err: `curl: (22) The requested URL returned error: ${faults.curlFails}\n`, status: 22 });
    failManifestCopy = Boolean(faults.failManifestCopy);
    noCurl = Boolean(faults.noCurl);
    answered = true;
  }

  /** Runs the script; a hang past 20 s is killed and shows as a null status. */
  function run(env: NodeJS.ProcessEnv, flags: string[]): Promise<Run> {
    if (!answered) answer();
    return new Promise((done) => {
      const child = spawn(process.execPath, ["-r", join(root, "spy.cjs"), join(root, "scripts", "vendor-playground-assets.mjs"), ...flags], {
        env: {
          ...process.env,
          CI: undefined, // a person at a terminal, even when the suite itself runs on CI
          HTTPS_PROXY: undefined,
          https_proxy: undefined,
          TMPDIR: join(root, "tmp"),
          PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
          FAKE_DATA: data,
          CALLS: callsFile,
          FAIL_MANIFEST_COPY: failManifestCopy ? "1" : undefined,
          NO_CURL: noCurl ? "1" : undefined,
          ...env,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
      child.on("close", (status) => {
        clearTimeout(timer);
        done({ status, stdout, stderr });
      });
    });
  }

  /** A copy of vendor/ as an earlier run left it. */
  function previousCopy(version = "0.58.0"): void {
    mkdirSync(vendorDir, { recursive: true });
    writeFileSync(join(vendorDir, MANIFEST), JSON.stringify({ [DESIGN_PACKAGE]: version }));
    writeFileSync(join(vendorDir, PREVIOUS), "kept");
  }

  /** Every program the run started, in order. */
  const started = (): Call[] => (existsSync(callsFile) ? readFileSync(callsFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Call) : []);

  return {
    root,
    vendorDir,
    designRelease,
    fontRelease,
    answer,
    previousCopy,
    vendor: (...flags: string[]) => run({}, flags),
    vendorInCI: (...flags: string[]) => run({ CI: "true" }, flags),
    vendorWith: (env: NodeJS.ProcessEnv, ...flags: string[]) => run(env, flags),
    started,
    manifest: (): Record<string, unknown> => JSON.parse(readFileSync(join(vendorDir, MANIFEST), "utf8")),
    /** The scratch directory the script made, which is where it told npm to put the tarball. */
    scratch: (): string => {
      const pack = started().find((call) => call.file === "npm" && call.args[0] === "pack")!;
      return pack.args[pack.args.indexOf("--pack-destination") + 1]!;
    },
    kept: () => readFileSync(join(vendorDir, PREVIOUS), "utf8"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

type Harness = ReturnType<typeof makeHarness>;

/** One case, in a harness of its own that is removed afterwards. */
function check(name: string, body: (h: Harness) => Promise<void>): void {
  it.concurrent(name, async () => {
    const h = makeHarness();
    try {
      await body(h);
    } finally {
      h.cleanup();
    }
  });
}

const extracted = (h: Harness) => h.started().filter((call) => call.file === "tar");

describe.concurrent("what a run vendors, and what it records", () => {
  check("writes the version and the tarball integrity of both packages into manifest.json", async (h) => {
    const run = await h.vendor();
    expect(run.status, run.stderr).toBe(0);
    expect(h.manifest()).toMatchObject({
      [DESIGN_PACKAGE]: "9.9.9",
      [FONT_PACKAGE]: "5.2.8",
      integrity: { [DESIGN_PACKAGE]: "sha512-design", [FONT_PACKAGE]: "sha512-font" },
    });
    expect(existsSync(join(h.vendorDir, "runtime", "index.js"))).toBe(true);
    expect(existsSync(join(h.vendorDir, "fonts", "jetbrains-mono-latin-wght-normal.woff2"))).toBe(true);
  });

  check("swaps the new copy in whole: nothing of the previous one is left, and nothing else is left beside it", async (h) => {
    h.previousCopy();
    const run = await h.vendor();
    expect(run.status, run.stderr).toBe(0);
    expect(h.manifest()[DESIGN_PACKAGE]).toBe("9.9.9");
    expect(existsSync(join(h.vendorDir, PREVIOUS))).toBe(false);
    expect(readdirSync(join(h.root, "public", "playgrounds"))).toEqual(["vendor"]);
  });

  check("writes manifest.json last, so a copy that dies midway does not look complete", async (h) => {
    h.answer({ failManifestCopy: true });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("ENOSPC");
    expect(existsSync(join(h.vendorDir, "runtime", "index.js"))).toBe(true);
    expect(existsSync(join(h.vendorDir, MANIFEST))).toBe(false);
  });
});

describe.concurrent("a release the registry lists no SLSA provenance for is refused", () => {
  const listings: [string, unknown][] = [
    ["npm prints nothing for it", null],
    ["it lists an attestation URL and no provenance", { url: LISTED.url }],
    ["it lists a publish attestation only", { url: LISTED.url, publish: { predicateType: PUBLISH } }],
    ["it lists a provenance type that is not SLSA v1", { url: LISTED.url, provenance: { predicateType: SLSA_V2 } }],
    ["it lists a provenance type that only starts like SLSA v1", { url: LISTED.url, provenance: { predicateType: "https://slsa.dev/provenance" } }],
    ["it lists a provenance type on another host that contains the SLSA URL", { url: LISTED.url, provenance: { predicateType: `https://example.test/${SLSA}` } }],
    ["it lists a provenance type on a host that merely starts with slsa.dev", { url: LISTED.url, provenance: { predicateType: "https://slsa.dev.example.test/provenance/v1" } }],
    ["it lists a URL that is not https", { url: "http://registry.example.test/attestations", provenance: { predicateType: SLSA } }],
  ];
  for (const [name, attestations] of listings) {
    check(name, async (h) => {
      h.answer({ attestations });
      const run = await h.vendor();
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("provenance");
      expect(run.stderr).toContain(`${DESIGN_PACKAGE}@9.9.9`);
      expect(existsSync(h.vendorDir)).toBe(false);
      expect(extracted(h)).toEqual([]);
    });
  }
});

describe.concurrent("a release is vendored only if the release workflow built these very bytes", () => {
  const wrong: [string, Attested, string][] = [
    ["another repository built it", { repository: OTHER_REPOSITORY }, `repository ${OTHER_REPOSITORY}`],
    ["another workflow file built it", { path: ".github/workflows/publish.yml" }, "workflow path .github/workflows/publish.yml"],
    ["another branch built it", { ref: "refs/heads/feature" }, "ref refs/heads/feature"],
    ["a tag built it", { ref: "refs/tags/v9.9.9" }, "ref refs/tags/v9.9.9"],
    ["a repository named like it, with a suffix, built it", { repository: `${REPOSITORY}-fork` }, `repository ${REPOSITORY}-fork`],
    ["a branch named like main, with a suffix, built it", { ref: `${REF}-evil` }, `ref ${REF}-evil`],
    ["its signed statement is another predicate type", { type: SLSA_V2 }, "predicate type https://slsa.dev/provenance/v2"],
    ["its signed statement only starts like SLSA v1", { type: "https://slsa.dev/provenance/v1.5" }, "predicate type https://slsa.dev/provenance/v1.5"],
    ["it attests other bytes", { digest: "0".repeat(128) }, "attests other bytes than the tarball npm delivered"],
    ["the bundle lists no SLSA v1 entry", { entryType: SLSA_V2 }, "cannot be read"],
  ];
  for (const [name, attested, said] of wrong) {
    check(`refuses it when ${name}`, async (h) => {
      h.answer({ attested });
      const run = await h.vendor();
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(said);
      expect(existsSync(h.vendorDir)).toBe(false);
      expect(extracted(h)).toEqual([]);
    });
  }

  const bundles: [string, unknown][] = [
    ["not JSON", "this is not a bundle"],
    ["empty", { attestations: [] }],
    ["without attestations", {}],
    ["carrying a payload that is not base64 JSON", { attestations: [{ predicateType: SLSA, bundle: { dsseEnvelope: { payload: "@@@" } } }] }],
    ["carrying a payload that is not text", { attestations: [{ predicateType: SLSA, bundle: { dsseEnvelope: { payload: 5 } } }] }],
  ];
  for (const [name, bundle] of bundles) {
    check(`refuses it when the bundle is ${name}`, async (h) => {
      h.answer({ bundle });
      const run = await h.vendor();
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("cannot be read");
      expect(extracted(h)).toEqual([]);
    });
  }

  check("gives its verdict before anything is extracted, and reads the attestation npm names", async (h) => {
    const run = await h.vendor();
    expect(run.status, run.stderr).toBe(0);
    const order = h.started().map((call) => (call.file === "npm" ? `npm ${call.args[0]}` : call.file));
    expect(order).toEqual(["npm pack", "npm view", "npm config", "curl", "tar", "npm pack", "tar"]);
    const curl = h.started().find((call) => call.file === "curl")!;
    expect(curl.args.slice(-2)).toEqual(["--url", LISTED.url]);
    expect(curl.args.join(" ")).toContain("--proto =https");
    expect(curl.args).toEqual(expect.arrayContaining(["--fail", "--silent", "--show-error", "--globoff"]));
  });

  check("fails when the attestation cannot be fetched, without extracting anything", async (h) => {
    h.answer({ curlFails: 503 });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("could not read the attestation");
    expect(run.stderr).toContain("returned error: 503");
    expect(run.stderr).toContain(`no offline copy of ${DESIGN_PACKAGE}`);
    expect(extracted(h)).toEqual([]);
  });

  check("says curl is required when there is none, without advising to reconnect", async (h) => {
    h.answer({ noCurl: true });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("curl is required");
    expect(run.stderr).not.toContain("Reconnect");
    expect(extracted(h)).toEqual([]);
  });

  check("does not advise reconnecting when the registry answers 404 for the attestation it listed", async (h) => {
    h.answer({ curlFails: 404 });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("returned error: 404");
    expect(run.stderr).not.toContain("Reconnect");
    expect(extracted(h)).toEqual([]);
  });
});

describe.concurrent("the proxy curl is given", () => {
  const curlArgs = (h: Harness) => h.started().find((call) => call.file === "curl")!.args;
  const proxies: [string, Record<string, string>, string[]][] = [
    ["npm's https-proxy", { "https-proxy": PROXY }, ["--proxy", PROXY]],
    ["npm's proxy when there is no https-proxy", { proxy: PLAIN_PROXY }, ["--proxy", PLAIN_PROXY]],
    ["npm's https-proxy before its proxy", { proxy: PLAIN_PROXY, "https-proxy": PROXY }, ["--proxy", PROXY]],
    ["no proxy when npm has none", {}, []],
  ];
  for (const [name, npmConfig, expected] of proxies) {
    check(`is ${name}`, async (h) => {
      h.answer({ npmConfig });
      const run = await h.vendor();
      expect(run.status, run.stderr).toBe(0);
      const args = curlArgs(h);
      expect(args.includes("--proxy") ? args.slice(args.indexOf("--proxy"), args.indexOf("--proxy") + 2) : []).toEqual(expected);
    });
  }

  check("is left to curl when HTTPS_PROXY is set: npm is not asked", async (h) => {
    h.answer({ npmConfig: { "https-proxy": PROXY } });
    const run = await h.vendorWith({ https_proxy: "http://env.test:3128" });
    expect(run.status, run.stderr).toBe(0);
    expect(curlArgs(h)).not.toContain("--proxy");
    expect(h.started().some((call) => call.file === "npm" && call.args[0] === "config")).toBe(false);
  });

  check("is none, and the run goes on, when npm cannot list its config", async (h) => {
    h.answer({ npmConfig: null });
    const run = await h.vendor();
    expect(run.status, run.stderr).toBe(0);
    expect(curlArgs(h)).not.toContain("--proxy");
  });
});

describe.concurrent("the retry budget", () => {
  check("lifts npm's release-age window for the design system's own release and its attestation, and for nothing else", async (h) => {
    const run = await h.vendor();
    expect(run.status, run.stderr).toBe(0);
    const lifted = h.started().filter((call) => call.file === "npm" && call.args.includes("--min-release-age=0"));
    expect(lifted.map((call) => `${call.args[0]} ${call.args[1]}`)).toEqual([`pack ${DESIGN_PACKAGE}@latest`, `view ${DESIGN_PACKAGE}@9.9.9`]);
  });

  check("gives a person at a terminal a fast failure: one retry after a second, and a 30 s bound on every program", async (h) => {
    const run = await h.vendor();
    expect(run.status, run.stderr).toBe(0);
    const programs = h.started();
    expect(programs.map((call) => call.file).sort()).toEqual(["curl", "npm", "npm", "npm", "npm", "tar", "tar"]);
    for (const call of programs) expect(call.timeout, call.file).toBe(30_000);
    for (const call of programs.filter((each) => each.file === "npm")) {
      expect(call.args).toEqual(expect.arrayContaining(["--fetch-retries=1", "--fetch-retry-mintimeout=1000", "--fetch-retry-maxtimeout=1000"]));
    }
    expect(programs.find((call) => call.file === "curl")!.args.join(" ")).toContain("--connect-timeout 5 --max-time 10 --retry 1 --retry-delay 1");
  });

  check("gives CI npm's own retries, curl the same patience, and a bound too long to cut them short", async (h) => {
    const run = await h.vendorInCI();
    expect(run.status, run.stderr).toBe(0);
    const programs = h.started();
    expect(programs).toHaveLength(7);
    for (const call of programs) expect(call.timeout, call.file).toBe(300_000);
    for (const call of programs.filter((each) => each.file === "npm")) {
      expect(call.args.filter((arg) => arg.startsWith("--fetch-retr"))).toEqual([]);
    }
    expect(programs.find((call) => call.file === "curl")!.args.join(" ")).toContain("--connect-timeout 10 --max-time 30 --retry 2 --retry-delay 30");
  });

  for (const value of ["false", "0", ""]) {
    check(`does not take CI=${JSON.stringify(value)} for CI`, async (h) => {
      const run = await h.vendorWith({ CI: value });
      expect(run.status, run.stderr).toBe(0);
      expect(h.started().every((call) => call.timeout === 30_000)).toBe(true);
    });
  }
});

describe.concurrent("the scratch directory", () => {
  check("is gone after a run that succeeds", async (h) => {
    expect((await h.vendor()).status).toBe(0);
    expect(existsSync(h.scratch())).toBe(false);
  });

  check("is gone after a run that fails halfway, with the design package already unpacked in it", async (h) => {
    h.answer({ font: null });
    expect((await h.vendor()).status).toBe(1);
    expect(extracted(h)).toHaveLength(1);
    expect(existsSync(h.scratch())).toBe(false);
  });
});

describe.concurrent("a failed run", () => {
  check("prints one message and sets the exit code, instead of an uncaught exception", async (h) => {
    h.answer({ offline: true });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`${DESIGN_PACKAGE}@latest`);
    expect(run.stderr).toContain("ENOTFOUND");
    expect(run.stderr).not.toMatch(/\n\s+at /);
    expect(run.stderr).not.toContain("[cause]");
  });

  check("leaves no half-filled vendor/ when the second fetch fails", async (h) => {
    h.answer({ font: null });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(existsSync(h.vendorDir)).toBe(false);
  });

  check("leaves the previous vendor/ as it was", async (h) => {
    h.previousCopy();
    h.answer({ font: null });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(h.kept()).toBe("kept");
    expect(h.manifest()[DESIGN_PACKAGE]).toBe("0.58.0");
  });

  const runtimes: [string, string[]][] = [
    ["no runtime directory", []],
    ["a runtime directory without index.js", ["select.js"]],
  ];
  for (const [name, runtime] of runtimes) {
    check(`says which file is missing when the package ships ${name}`, async (h) => {
      h.answer({ design: h.designRelease({ runtime }) });
      const run = await h.vendor();
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("ships no runtime/index.js");
      expect(run.stderr).not.toContain("ENOENT");
    });
  }

  check("advises reconnecting only when the registry could not be reached", async (h) => {
    h.answer({ packError: { code: "E404", summary: "404 Not Found - GET https://registry.npmjs.org/@danieldeusing%2fdesign" } });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("404 Not Found");
    expect(run.stderr).not.toContain("Reconnect");
  });

  check("names the package it could not fetch: the font package is not the design system", async (h) => {
    h.answer({ fontOffline: true });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`no offline copy of ${FONT_PACKAGE} to fall back to`);
    expect(run.stderr).not.toContain(`no offline copy of ${DESIGN_PACKAGE}`);
  });

  check("gives npm's last word on stderr when it dies without a JSON body, not the command line", async (h) => {
    h.answer({ crash: "npm error the first thing\nnpm error the last thing\nnpm error A complete log of this run can be found in: /nowhere/x.log\n" });
    const run = await h.vendor();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("failed: npm error the last thing");
    expect(run.stderr).not.toContain("Command failed");
    expect(run.stderr).not.toContain("complete log");
  });
});

describe.concurrent("--keep-previous, which is what pnpm dev passes", () => {
  check("keeps the previous copy when the registry is unreachable, and says which release it kept", async (h) => {
    h.previousCopy("0.58.0");
    h.answer({ offline: true });
    const run = await h.vendor(KEEP_PREVIOUS);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toContain(`${DESIGN_PACKAGE}@0.58.0`);
    expect(h.kept()).toBe("kept");
  });

  for (const code of ["E429", "E503"]) {
    check(`keeps it when npm answers ${code}, which is the registry being unavailable`, async (h) => {
      h.previousCopy("0.58.0");
      h.answer({ packError: { code, summary: `${code.slice(1)} from the registry` } });
      const run = await h.vendor(KEEP_PREVIOUS);
      expect(run.status, run.stderr).toBe(0);
      expect(run.stderr).toContain(`${DESIGN_PACKAGE}@0.58.0`);
      expect(run.stderr).toContain("Reconnect");
    });
  }

  for (const status of [503, 429]) {
    check(`keeps it when the attestation URL answers ${status}, which is the registry being unavailable`, async (h) => {
      h.previousCopy("0.58.0");
      h.answer({ curlFails: status });
      const run = await h.vendor(KEEP_PREVIOUS);
      expect(run.status, run.stderr).toBe(0);
      expect(run.stderr).toContain(`${DESIGN_PACKAGE}@0.58.0`);
    });
  }

  const refusals: [string, (h: Harness) => Scenario][] = [
    ["a release with no provenance", () => ({ attestations: null })],
    ["a release another repository built", () => ({ attested: { repository: OTHER_REPOSITORY } })],
    ["an attestation the registry answers 404 for", () => ({ curlFails: 404 })],
    ["a machine without curl", () => ({ noCurl: true })],
    ["a stylesheet that fetches from another origin", (h) => ({ design: h.designRelease({ css: "a{background:url(HTTPS://cdn.example.test/x.png)}" }) })],
    ["a package without its runtime", (h) => ({ design: h.designRelease({ runtime: [] }) })],
    ["a package whose runtime lacks index.js", (h) => ({ design: h.designRelease({ runtime: ["select.js"] }) })],
    ["a package npm cannot find", () => ({ packError: { code: "E404", summary: "404 Not Found" } })],
    ["an npm that dies without a word", () => ({ crash: "npm error something else entirely\n" })],
  ];
  for (const [name, scenario] of refusals) {
    check(`does not forgive ${name}: the run fails and the previous copy is not used`, async (h) => {
      h.previousCopy("0.58.0");
      h.answer(scenario(h));
      const run = await h.vendor(KEEP_PREVIOUS);
      expect(run.status).toBe(1);
      expect(run.stderr).not.toContain("Keeping the previous");
      expect(run.stderr).toContain(`forgives an unreachable registry only, so the previous copy (${DESIGN_PACKAGE}@0.58.0) is not used`);
      expect(h.kept()).toBe("kept");
    });
  }

  check("does not claim to have kept a copy that its own swap destroyed", async (h) => {
    h.previousCopy("0.58.0");
    h.answer({ failManifestCopy: true });
    const run = await h.vendor(KEEP_PREVIOUS);
    expect(run.status).toBe(1);
    expect(run.stderr).not.toContain("Keeping the previous");
    expect(run.stderr).toContain(`the previous copy (${DESIGN_PACKAGE}@0.58.0) is not used`);
  });

  check("still fails when there is no complete previous copy to keep", async (h) => {
    h.answer({ offline: true });
    expect((await h.vendor(KEEP_PREVIOUS)).status).toBe(1);
    mkdirSync(h.vendorDir, { recursive: true });
    writeFileSync(join(h.vendorDir, "danieldeusing-design.min.css"), "half a copy, no manifest.json");
    expect((await h.vendor(KEEP_PREVIOUS)).status).toBe(1);
  });

  check("fetches normally when the registry answers", async (h) => {
    h.previousCopy();
    const run = await h.vendor(KEEP_PREVIOUS);
    expect(run.status, run.stderr).toBe(0);
    expect(h.manifest()[DESIGN_PACKAGE]).toBe("9.9.9");
  });

  check("is what a build lacks: without it an unreachable registry fails even with a previous copy", async (h) => {
    h.previousCopy();
    h.answer({ offline: true });
    expect((await h.vendor()).status).toBe(1);
    expect(h.kept()).toBe("kept");
  });
});

describe.concurrent("the remote-URL guard", () => {
  for (const css of ["url(https://cdn.example.test/a.woff2)", "url(HTTPS://cdn.example.test/a.woff2)", "@import Url('Https://cdn.example.test/a.css');", "url(//cdn.example.test/a.woff2)"]) {
    check(`refuses ${css}`, async (h) => {
      h.answer({ design: h.designRelease({ css: `:root{--fg:#111}${css}` }) });
      const run = await h.vendor();
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("remote URL");
    });
  }

  check("lets an inline SVG's namespace URI through, whatever case its data: URL is written in", async (h) => {
    const svg = "%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    h.answer({ design: h.designRelease({ css: `a{background:url(data:image/svg+xml,${svg})}b{background:URL(DATA:image/svg+xml,${svg})}` }) });
    const run = await h.vendor();
    expect(run.status, run.stderr).toBe(0);
  });
});

describe("pnpm dev and pnpm build run one prepare step", () => {
  const scripts = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")).scripts as Record<string, string>;

  it("hands --keep-previous to prepare:assets, which build runs bare", () => {
    expect(scripts.dev).toMatch(/^pnpm run prepare:assets --keep-previous( |$)/);
    expect(scripts.build).toMatch(/^pnpm run prepare:assets( |$)/);
    expect(scripts.build).not.toContain(KEEP_PREVIOUS);
  });

  it("keeps the vendor script the last command of prepare:assets, which is where pnpm appends the flag", () => {
    expect(scripts["prepare:assets"]!.split("&&").at(-1)!.trim()).toBe("node scripts/vendor-playground-assets.mjs");
  });
});
