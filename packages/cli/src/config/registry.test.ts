import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});
vi.mock("node:fs", async () => {
  const memfs = await import("memfs");
  return memfs.fs;
});

const LOCAL_DIR = "/private/registry";
const SLUG = "private-skill";
const INDEX = { version: "2.0.0", types: { skill: { file: "skills/manifest.json", count: 1 } } };
const SKILLS = { type: "skill", items: [{ slug: SLUG, name: "Private", type: "skill", description: "Ours.", compatibility: ["claude"], sourceType: "toolr" }] };

async function freshRegistry() {
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

    const registry = await freshRegistry();
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

    const registry = await freshRegistry();
    const items = await registry.listItems("skill");

    expect(items.map((i) => i.slug)).toEqual([SLUG]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://seedr.example.test/registry/manifest.json",
      "https://seedr.example.test/registry/skills/manifest.json",
    ]);
  });

  it("refuses slugs that are not a single lowercase path segment", async () => {
    process.env.SEEDR_REGISTRY_DIR = LOCAL_DIR;
    const registry = await freshRegistry();
    const item = { slug: "../escape", name: "x", type: "skill" as const, description: "x", compatibility: [], sourceType: "toolr" as const };
    expect(() => registry.getItemSourcePath(item)).toThrow(/Invalid slug/);
  });
});
