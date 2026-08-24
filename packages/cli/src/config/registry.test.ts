import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RegistryItem } from "@seedr/shared";

const LICENSE_TEXT = "MIT License\n";
const PLUGIN_JSON = ".claude-plugin/plugin.json";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// `node:fs` drives the local-registry discovery (`existsSync`); with an empty
// volume the loader sees no checkout and goes remote-only.
vi.mock("node:fs", async () => {
  const memfs = await import("memfs");
  return memfs.fs;
});

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
  tmpdir: () => "/tmp",
}));

const SHA = "c".repeat(40);
const RAW = "https://raw.githubusercontent.com";
const REGISTRY_RAW = `${RAW}/danieldeusing/seedr/main/registry`;
const VECTOR_DIGEST = "b081846d406e05af3c1d8a5b226d6eaf344553cf5f05160ed25d98eeca98fbb6";
const PDF_BASE = `${RAW}/anthropics/skills/${SHA}/skills/pdf`;
const SKILL_TREE = [
  { name: "SKILL.md", type: "file" as const },
  { name: "scripts", type: "directory" as const, children: [{ name: "a.py", type: "file" as const }] },
];

const responses = new Map<string, string | Buffer>();
const fetchMock = vi.fn(async (url: string) => {
  const body = responses.get(url);
  if (body === undefined) {
    return new Response("not found", { status: 404, statusText: "Not Found" });
  }
  return new Response(body, { status: 200 });
});
vi.stubGlobal("fetch", fetchMock);

function serveVector(base: string, root: string): void {
  responses.set(`${base}/SKILL.md`, "hello\n");
  responses.set(`${base}/scripts/a.py`, "print(1)\n");
  responses.set(`${root}/LICENSE`, LICENSE_TEXT);
}

function officialSkill(overrides: Partial<RegistryItem> = {}): RegistryItem {
  return {
    slug: "pdf",
    name: "PDF",
    type: "skill",
    description: "d",
    compatibility: ["claude"],
    sourceType: "official",
    externalUrl: "https://github.com/anthropics/skills/tree/main/skills/pdf",
    sourceRevision: SHA,
    contentDigest: VECTOR_DIGEST,
    contents: { files: SKILL_TREE },
    license: { spdx: "MIT", file: "LICENSE", installAs: "LICENSE" },
    ...overrides,
  };
}

async function loadRegistry() {
  vi.resetModules();
  return import("./registry.js");
}

function stagingDirsUnder(dir: string): string[] {
  if (!vol.existsSync(dir)) return [];
  return (vol.readdirSync(dir) as string[]).filter((name) => name.startsWith(".seedr-"));
}

describe("fetchItemToDestination", () => {
  beforeEach(() => {
    vol.reset();
    responses.clear();
    fetchMock.mockClear();
  });
  afterEach(() => vol.reset());

  it("downloads the pinned tree plus the license, verifies the digest and reports the revision", async () => {
    serveVector(PDF_BASE, `${RAW}/anthropics/skills/${SHA}`);
    const { fetchItemToDestination } = await loadRegistry();

    const result = await fetchItemToDestination(officialSkill(), "/dest/pdf");

    expect(result).toEqual({ sourceRevision: SHA, contentDigest: VECTOR_DIGEST, files: ["SKILL.md", "scripts/a.py", "LICENSE"] });
    expect(vol.readFileSync("/dest/pdf/SKILL.md", "utf-8")).toBe("hello\n");
    expect(vol.readFileSync("/dest/pdf/scripts/a.py", "utf-8")).toBe("print(1)\n");
    expect(vol.readFileSync("/dest/pdf/LICENSE", "utf-8")).toBe(LICENSE_TEXT);
    expect(stagingDirsUnder("/dest")).toEqual([]);

    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls).toEqual(
      expect.arrayContaining([`${PDF_BASE}/SKILL.md`, `${PDF_BASE}/scripts/a.py`, `${RAW}/anthropics/skills/${SHA}/LICENSE`])
    );
    expect(urls.every((url) => url.includes(`/${SHA}/`))).toBe(true);
    expect(urls.some((url) => url.includes("/main/"))).toBe(false);
  });

  it("refuses a digest mismatch and leaves nothing behind", async () => {
    serveVector(PDF_BASE, `${RAW}/anthropics/skills/${SHA}`);
    responses.set(`${PDF_BASE}/SKILL.md`, "tampered\n");
    const { fetchItemToDestination } = await loadRegistry();

    await expect(fetchItemToDestination(officialSkill(), "/dest/pdf")).rejects.toThrow(
      new RegExp(`Registry integrity error: skill "pdf" — content digest mismatch \\(expected ${VECTOR_DIGEST}, actual [0-9a-f]{64}\\)`)
    );
    expect(vol.existsSync("/dest/pdf")).toBe(false);
    expect(stagingDirsUnder("/dest")).toEqual([]);
  });

  it("detects a torn download where one file comes from another commit", async () => {
    serveVector(PDF_BASE, `${RAW}/anthropics/skills/${SHA}`);
    responses.set(`${PDF_BASE}/scripts/a.py`, "print(2)  # newer commit\n");
    const { fetchItemToDestination } = await loadRegistry();

    await expect(fetchItemToDestination(officialSkill(), "/dest/pdf")).rejects.toThrow(/content digest mismatch/);
    expect(vol.existsSync("/dest/pdf")).toBe(false);
  });

  it("fails closed before downloading when a non-first-party item has no digest", async () => {
    serveVector(PDF_BASE, `${RAW}/anthropics/skills/${SHA}`);
    const { fetchItemToDestination } = await loadRegistry();

    await expect(fetchItemToDestination(officialSkill({ contentDigest: undefined }), "/dest/pdf")).rejects.toThrow(
      /Registry integrity error: skill "pdf" — the registry entry carries no contentDigest/
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vol.existsSync("/dest")).toBe(false);
  });

  it("fails closed for a legacy community item with neither revision nor digest", async () => {
    const { fetchItemToDestination } = await loadRegistry();
    const legacy = officialSkill({ sourceType: "community", sourceRevision: undefined, contentDigest: undefined, license: undefined });
    await expect(fetchItemToDestination(legacy, "/dest/pdf")).rejects.toThrow(/carries no contentDigest/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("installs a first-party item without a digest from the registry trust root (legacy toolr)", async () => {
    responses.set(`${REGISTRY_RAW}/hooks/lint/lint.sh`, "#!/bin/sh\n");
    const { fetchItemToDestination } = await loadRegistry();
    const toolr: RegistryItem = {
      slug: "lint",
      name: "Lint",
      type: "hook",
      description: "d",
      compatibility: ["claude"],
      sourceType: "toolr",
      contents: { files: [{ name: "lint.sh", type: "file" }] },
    };

    const result = await fetchItemToDestination(toolr, "/dest/lint");
    expect(result).toEqual({ sourceRevision: null, contentDigest: null, files: ["lint.sh"] });
    expect(vol.readFileSync("/dest/lint/lint.sh", "utf-8")).toBe("#!/bin/sh\n");
  });

  it("verifies a first-party item whenever it carries a digest", async () => {
    responses.set(`${REGISTRY_RAW}/skills/mine/SKILL.md`, "hello\n");
    responses.set(`${REGISTRY_RAW}/skills/mine/scripts/a.py`, "print(1)\n");
    responses.set(`${RAW}/danieldeusing/seedr/main/LICENSE`, LICENSE_TEXT);
    const { fetchItemToDestination } = await loadRegistry();
    const toolr = officialSkill({ slug: "mine", sourceType: "toolr", sourceRevision: undefined });

    await expect(fetchItemToDestination(toolr, "/dest/mine")).resolves.toMatchObject({ contentDigest: VECTOR_DIGEST });

    responses.set(`${REGISTRY_RAW}/skills/mine/SKILL.md`, "changed\n");
    await expect(fetchItemToDestination(toolr, "/dest/mine2")).rejects.toThrow(/content digest mismatch/);
  });

  it("falls back to the legacy single-file list for a first-party item without a tree", async () => {
    responses.set(`${REGISTRY_RAW}/skills/old/SKILL.md`, "# old\n");
    const { fetchItemToDestination } = await loadRegistry();
    const toolr: RegistryItem = { slug: "old", name: "Old", type: "skill", description: "d", compatibility: ["claude"], sourceType: "toolr" };
    await expect(fetchItemToDestination(toolr, "/dest/old")).resolves.toMatchObject({ files: ["SKILL.md"] });
    expect(vol.readFileSync("/dest/old/SKILL.md", "utf-8")).toBe("# old\n");
  });

  it("loads a plugin's stripped tree and digest from item.json and fetches from the pinned marketplace", async () => {
    const marketplaceSha = "d".repeat(40);
    const base = `${RAW}/anthropics/claude-plugins-official/${marketplaceSha}/plugins/feature-dev`;
    const pluginJson = '{"name":"feature-dev","version":"1.2.3"}';
    responses.set(`${base}/.claude-plugin/plugin.json`, pluginJson);
    const { computeContentDigest } = await import("../utils/digest.js");
    vol.fromJSON({ "/expected/.claude-plugin/plugin.json": pluginJson });
    const digest = await computeContentDigest("/expected", [PLUGIN_JSON]);
    const fullItem = {
      slug: "feature-dev",
      type: "plugin",
      contents: { files: [{ name: ".claude-plugin", type: "directory", children: [{ name: "plugin.json", type: "file" }] }] },
      contentDigest: digest,
    };
    responses.set(`${REGISTRY_RAW}/plugins/feature-dev/item.json`, JSON.stringify(fullItem));
    const { fetchItemToDestination } = await loadRegistry();
    const plugin: RegistryItem = {
      slug: "feature-dev",
      name: "Feature Dev",
      type: "plugin",
      description: "d",
      compatibility: ["claude"],
      sourceType: "official",
      externalUrl: "https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev",
      pluginSource: { kind: "marketplace-path", path: "plugins/feature-dev", sha: marketplaceSha },
      marketplaceRef: { name: "claude-plugins-official", url: "https://github.com/anthropics/claude-plugins-official", sha: marketplaceSha },
    };

    const result = await fetchItemToDestination(plugin, "/dest/feature-dev");
    expect(result).toEqual({ sourceRevision: marketplaceSha, contentDigest: digest, files: [PLUGIN_JSON] });
    expect(vol.readFileSync("/dest/feature-dev/.claude-plugin/plugin.json", "utf-8")).toBe(pluginJson);
  });

  it("refuses when the manifest digest and item.json digest disagree", async () => {
    responses.set(
      `${REGISTRY_RAW}/plugins/x/item.json`,
      JSON.stringify({ contents: { files: [{ name: "a", type: "file" }] }, contentDigest: "e".repeat(64) })
    );
    const { fetchItemToDestination } = await loadRegistry();
    const plugin: RegistryItem = {
      slug: "x",
      name: "x",
      type: "plugin",
      description: "d",
      compatibility: ["claude"],
      sourceType: "community",
      externalUrl: "https://github.com/o/r",
      sourceRevision: SHA,
      contentDigest: "f".repeat(64),
    };
    await expect(fetchItemToDestination(plugin, "/dest/x")).rejects.toThrow(/manifest digest .* disagrees with item.json digest/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unsafe node names in the tree before fetching", async () => {
    const { fetchItemToDestination } = await loadRegistry();
    const evil = officialSkill({ contents: { files: [{ name: "..", type: "directory", children: [{ name: "x", type: "file" }] }] } });
    await expect(fetchItemToDestination(evil, "/dest/pdf")).rejects.toThrow(/Unsafe file name/);
    expect(vol.existsSync("/dest/x")).toBe(false);
  });

  it("refuses a license.installAs without a license.file", async () => {
    const { fetchItemToDestination } = await loadRegistry();
    await expect(
      fetchItemToDestination(officialSkill({ license: { installAs: "LICENSE" } }), "/dest/pdf")
    ).rejects.toThrow(/license.installAs "LICENSE" is set without license.file/);
  });

  it("replaces an existing destination with the verified tree", async () => {
    serveVector(PDF_BASE, `${RAW}/anthropics/skills/${SHA}`);
    vol.fromJSON({ "/dest/pdf/stale.txt": "stale", "/dest/pdf/SKILL.md": "old" });
    const { fetchItemToDestination } = await loadRegistry();
    await fetchItemToDestination(officialSkill(), "/dest/pdf");
    expect(vol.existsSync("/dest/pdf/stale.txt")).toBe(false);
    expect(vol.readFileSync("/dest/pdf/SKILL.md", "utf-8")).toBe("hello\n");
  });

  it("surfaces download failures as registry errors and cleans up", async () => {
    const { fetchItemToDestination } = await loadRegistry();
    await expect(fetchItemToDestination(officialSkill(), "/dest/pdf")).rejects.toThrow(/Failed to fetch .*Not Found/);
    expect(stagingDirsUnder("/dest")).toEqual([]);
  });
});

describe("getItemContent / fetchItemFile", () => {
  beforeEach(() => {
    vol.reset();
    responses.clear();
    fetchMock.mockClear();
    vol.mkdirSync("/tmp", { recursive: true });
  });

  it("returns the main file through the verified download and removes its temp dir", async () => {
    serveVector(PDF_BASE, `${RAW}/anthropics/skills/${SHA}`);
    const { getItemContent } = await loadRegistry();
    await expect(getItemContent(officialSkill())).resolves.toBe("hello\n");
    expect(vol.readdirSync("/tmp")).toEqual([]);
  });

  it("propagates integrity errors from the main-file read", async () => {
    serveVector(PDF_BASE, `${RAW}/anthropics/skills/${SHA}`);
    responses.set(`${PDF_BASE}/SKILL.md`, "tampered\n");
    const { getItemContent } = await loadRegistry();
    await expect(getItemContent(officialSkill())).rejects.toThrow(/Registry integrity error/);
    expect(vol.readdirSync("/tmp")).toEqual([]);
  });

  it("fetchItemFile reads one file without verification and validates the path", async () => {
    responses.set(`${PDF_BASE}/.claude-plugin/plugin.json`, '{"name":"pdf"}');
    const { fetchItemFile } = await loadRegistry();
    await expect(fetchItemFile(officialSkill(), PLUGIN_JSON)).resolves.toBe('{"name":"pdf"}');
    await expect(fetchItemFile(officialSkill(), "../etc/passwd")).rejects.toThrow(/Unsafe file name/);
  });
});

describe("manifest loading (remote)", () => {
  beforeEach(() => {
    vol.reset();
    responses.clear();
    fetchMock.mockClear();
    responses.set(
      `${REGISTRY_RAW}/manifest.json`,
      JSON.stringify({ version: "2.0.0", types: { skill: { file: "skills/manifest.json", count: 1 }, plugin: { file: "plugins/manifest.json", count: 1 } } })
    );
    responses.set(`${REGISTRY_RAW}/skills/manifest.json`, JSON.stringify({ type: "skill", items: [officialSkill()] }));
    responses.set(
      `${REGISTRY_RAW}/plugins/manifest.json`,
      JSON.stringify({ type: "plugin", items: [{ ...officialSkill(), type: "plugin", slug: "pdf", name: "PDF plugin", description: "plugin desc" }] })
    );
  });

  it("assembles, looks up by (type, slug), lists and searches", async () => {
    const { loadManifest, getItem, listItems, searchItems, clearCache, getItemFull, typeDirName, mainFileName } = await loadRegistry();
    const manifest = await loadManifest();
    expect(manifest.items).toHaveLength(2);
    expect((await getItem("pdf", "plugin"))?.name).toBe("PDF plugin");
    expect((await getItem("pdf"))?.type).toBe("skill");
    expect(await getItem("missing")).toBeUndefined();
    expect(await listItems("plugin")).toHaveLength(1);
    expect(await listItems()).toHaveLength(2);
    expect((await searchItems("PLUGIN DESC")).map((i) => i.type)).toEqual(["plugin"]);
    expect(typeDirName("mcp")).toBe("mcp");
    expect(typeDirName("settings")).toBe("settings");
    expect(typeDirName("skill")).toBe("skills");
    expect(mainFileName("skill")).toBe("SKILL.md");
    expect(mainFileName("mcp")).toBe("mcp.md");

    responses.set(`${REGISTRY_RAW}/skills/pdf/item.json`, JSON.stringify({ slug: "pdf", longDescription: "long" }));
    expect((await getItemFull(officialSkill())).longDescription).toBe("long");
    await expect(getItemFull(officialSkill({ slug: "../x" }))).rejects.toThrow(/Invalid item slug/);

    clearCache();
    const calls = fetchMock.mock.calls.length;
    await loadManifest();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it("reports unreachable and failed registry fetches", async () => {
    const { loadManifest } = await loadRegistry();
    responses.delete(`${REGISTRY_RAW}/manifest.json`);
    await expect(loadManifest()).rejects.toThrow(/Failed to fetch .*manifest.json: Not Found/);

    fetchMock.mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    await expect(loadManifest()).rejects.toThrow(/Registry unreachable: timed out/);

    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(loadManifest()).rejects.toThrow(/Registry unreachable: /);
  });

  it("getItemSourcePath and listItemFiles are null/minimal without a local checkout", async () => {
    const { getItemSourcePath, listItemFiles } = await loadRegistry();
    expect(getItemSourcePath(officialSkill())).toBeNull();
    expect(getItemSourcePath(officialSkill({ sourceType: "toolr" }))).toBeNull();
    await expect(listItemFiles(officialSkill())).resolves.toEqual(["SKILL.md"]);
  });
});

describe("local registry checkout", () => {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const registryDir = join(packageRoot, "..", "..", "registry");

  beforeEach(() => {
    vol.reset();
    responses.clear();
    fetchMock.mockClear();
    vol.fromJSON({
      [join(packageRoot, "package.json")]: "{}",
      [join(registryDir, "manifest.json")]: JSON.stringify({ version: "2.0.0", types: { mcp: { file: "mcp/manifest.json", count: 1 } } }),
      [join(registryDir, "mcp/manifest.json")]: JSON.stringify({
        type: "mcp",
        items: [{ slug: "playwright", name: "Playwright", type: "mcp", description: "d", compatibility: ["claude"], sourceType: "toolr" }],
      }),
      [join(registryDir, "mcp/playwright/mcp.md")]: '{"name":"playwright","config":{"command":"npx"}}',
      [join(registryDir, "mcp/playwright/item.json")]: '{"slug":"playwright"}',
      [join(registryDir, "mcp/playwright/docs/notes.md")]: "notes",
    });
  });

  it("reads first-party content, files and source paths from disk without any fetch", async () => {
    const { getItem, getItemContent, getItemSourcePath, listItemFiles, getItemFull, fetchItemFile } = await loadRegistry();
    const item = (await getItem("playwright", "mcp"))!;
    expect(item.sourceType).toBe("toolr");
    expect(await getItemContent(item)).toBe('{"name":"playwright","config":{"command":"npx"}}');
    expect(getItemSourcePath(item)).toBe(join(registryDir, "mcp", "playwright"));
    expect((await listItemFiles(item)).sort()).toEqual(["docs/notes.md", "item.json", "mcp.md"]);
    expect((await getItemFull(item)).slug).toBe("playwright");
    expect(await fetchItemFile(item, "docs/notes.md")).toBe("notes");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a local manifest with an unexpected shape", async () => {
    vol.writeFileSync(join(registryDir, "manifest.json"), JSON.stringify({ unrelated: true }));
    responses.set(`${REGISTRY_RAW}/manifest.json`, JSON.stringify({ version: "2.0.0", types: {} }));
    const { loadManifest } = await loadRegistry();
    expect((await loadManifest()).items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(`${REGISTRY_RAW}/manifest.json`, expect.anything());
  });
});

const LOCAL_DIR = "/private/registry";
const SLUG = "private-skill";
const INDEX = { version: "2.0.0", types: { skill: { file: "skills/manifest.json", count: 1 } } };
const SKILLS = { type: "skill", items: [{ slug: SLUG, name: "Private", type: "skill", description: "Ours.", compatibility: ["claude"], sourceType: "toolr" }] };

async function freshLocationRegistry() {
  vi.resetModules();
  return import("./registry.js");
}

describe("registry location", () => {
  const env = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vol.reset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("reads a local checkout named by SEEDR_REGISTRY_DIR without touching the network", async () => {
    vol.fromJSON({
      [`${LOCAL_DIR}/manifest.json`]: JSON.stringify(INDEX),
      [`${LOCAL_DIR}/skills/manifest.json`]: JSON.stringify(SKILLS),
    });
    process.env.SEEDR_REGISTRY_DIR = LOCAL_DIR;

    const registry = await freshLocationRegistry();
    const items = await registry.listItems("skill");

    expect(items.map((i) => i.slug)).toEqual([SLUG]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches from the base URL named by SEEDR_REGISTRY_URL when no local registry exists", async () => {
    process.env.SEEDR_REGISTRY_DIR = "/nowhere";
    process.env.SEEDR_REGISTRY_URL = "https://seedr.example.test/registry/";
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      statusText: "OK",
      text: async () => JSON.stringify(url.endsWith("/manifest.json") && !url.includes("/skills/") ? INDEX : SKILLS),
    }));

    const registry = await freshLocationRegistry();
    const items = await registry.listItems("skill");

    expect(items.map((i) => i.slug)).toEqual([SLUG]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://seedr.example.test/registry/manifest.json",
      "https://seedr.example.test/registry/skills/manifest.json",
    ]);
  });

  it("refuses slugs that are not a single lowercase path segment", async () => {
    process.env.SEEDR_REGISTRY_DIR = LOCAL_DIR;
    const registry = await freshLocationRegistry();
    const item = { slug: "../escape", name: "x", type: "skill" as const, description: "x", compatibility: [], sourceType: "toolr" as const };
    expect(() => registry.getItemSourcePath(item)).toThrow(/Invalid item slug/);
  });
});
