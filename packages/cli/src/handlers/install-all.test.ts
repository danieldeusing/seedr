/**
 * Smoke tests: verify every manifest item can be installed.
 *
 * Mocked (default):  pnpm test -- install-all
 * Live URL check:    SEEDR_LIVE=true pnpm test -- install-all
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RegistryItem, RegistryManifest } from "@seedr/shared";

// Read real manifest using sync fs (unaffected by memfs mock of node:fs/promises)
const __testDir = dirname(fileURLToPath(import.meta.url));
const registryDir = join(__testDir, "../../../../registry");
const indexData = JSON.parse(readFileSync(join(registryDir, "manifest.json"), "utf-8"));
const items: RegistryItem[] = [];
for (const desc of Object.values(indexData.types) as { file: string }[]) {
  const typeData = JSON.parse(readFileSync(join(registryDir, desc.file), "utf-8"));
  items.push(...typeData.items);
}
const manifest: RegistryManifest = { version: indexData.version, items };

const LIVE = process.env.SEEDR_LIVE === "true";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: null) => void) => cb(null)),
}));

vi.mock("../config/registry.js", () => ({
  getItemSourcePath: vi.fn((item: RegistryItem) => {
    if (item.sourceType === "toolr") {
      return `/registry/${item.type}s/${item.slug}`;
    }
    return null;
  }),
  getItemContent: vi.fn(async (item: RegistryItem) => {
    switch (item.type) {
      case "hook":
        return JSON.stringify({
          event: "PreCommit",
          hooks: [{ type: "command", command: "echo test" }],
        });
      case "mcp":
        return JSON.stringify({
          name: item.slug,
          config: { command: "npx", args: ["-y", "mock-server"] },
        });
      case "settings":
        return JSON.stringify({ mock: true });
      default:
        return `# ${item.name}\n\nMock content.`;
    }
  }),
  fetchItemToDestination: vi.fn(async (item: RegistryItem, destPath: string) => {
    vol.mkdirSync(destPath, { recursive: true });
    if (item.contents?.files) {
      const writeTree = (nodes: { name: string; type: string; children?: any[] }[], dir: string) => {
        for (const node of nodes) {
          const nodePath = join(dir, node.name);
          if (node.type === "directory") {
            vol.mkdirSync(nodePath, { recursive: true });
            if (node.children) writeTree(node.children, nodePath);
          } else if (node.name.endsWith(".json")) {
            vol.writeFileSync(nodePath, JSON.stringify({ name: "stub" }));
          } else {
            vol.writeFileSync(nodePath, `stub: ${node.name}`);
          }
        }
      };
      writeTree(item.contents.files, destPath);
    } else {
      vol.writeFileSync(join(destPath, "STUB"), "stub");
    }
  }),
}));

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

// ---------------------------------------------------------------------------
// Mocked install tests — run on every build
// ---------------------------------------------------------------------------

describe("install all manifest items (mocked)", () => {
  beforeEach(() => {
    vol.reset();
    // Set up local source dirs for toolr items with correct content files
    const writeTree = (nodes: { name: string; type: string; children?: any[] }[], dir: string) => {
      for (const node of nodes) {
        const nodePath = join(dir, node.name);
        if (node.type === "directory") {
          vol.mkdirSync(nodePath, { recursive: true });
          if (node.children) writeTree(node.children, nodePath);
        } else if (node.name.endsWith(".json")) {
          vol.writeFileSync(nodePath, JSON.stringify({ name: "stub" }));
        } else {
          vol.writeFileSync(nodePath, `stub: ${node.name}`);
        }
      }
    };
    for (const item of manifest.items) {
      if (item.sourceType === "toolr") {
        const srcPath = `/registry/${item.type}s/${item.slug}`;
        vol.mkdirSync(srcPath, { recursive: true });

        if (item.contents?.files) {
          writeTree(item.contents.files, srcPath);
        } else {
          vol.writeFileSync(join(srcPath, "SKILL.md"), `# ${item.name}\n`);
        }
      }
    }
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  const byType = (type: string) =>
    manifest.items.filter((i) => i.type === type) as RegistryItem[];

  describe("skills", () => {
    for (const item of byType("skill")) {
      it(`${item.slug} (${item.sourceType})`, async () => {
        const { installSkill } = await import("./skill.js");
        const results = await installSkill(item, ["claude"], "project", "copy", true, "/test/project");
        expect(results[0]?.success).toBe(true);
      });
    }
  });

  describe("plugins", () => {
    for (const item of byType("plugin")) {
      it(`${item.slug} (${item.sourceType})`, async () => {
        const { installPlugin } = await import("./plugin.js");
        const results = await installPlugin(item, ["claude"], "project", "copy", true, "/test/project");
        expect(results[0]?.success).toBe(true);
      });
    }
  });

  describe.skipIf(byType("agent").length === 0)("agents", () => {
    for (const item of byType("agent")) {
      it(`${item.slug} (${item.sourceType})`, async () => {
        const { installAgent } = await import("./agent.js");
        const results = await installAgent(item, ["claude"], "project", "copy", true, "/test/project");
        expect(results[0]?.success).toBe(true);
      });
    }
  });

  describe.skipIf(byType("hook").length === 0)("hooks", () => {
    for (const item of byType("hook")) {
      it(`${item.slug} (${item.sourceType})`, async () => {
        const { installHook } = await import("./hook.js");
        const results = await installHook(item, ["claude"], "project", "copy", true, "/test/project");
        expect(results[0]?.success).toBe(true);
      });
    }
  });

  describe.skipIf(byType("mcp").length === 0)("mcp servers", () => {
    for (const item of byType("mcp")) {
      it(`${item.slug} (${item.sourceType})`, async () => {
        const { installMcp } = await import("./mcp.js");
        const results = await installMcp(item, ["claude"], "project", "copy", true, "/test/project");
        expect(results[0]?.success).toBe(true);
      });
    }
  });

  describe.skipIf(byType("settings").length === 0)("settings", () => {
    for (const item of byType("settings")) {
      it(`${item.slug} (${item.sourceType})`, async () => {
        const { installSettings } = await import("./settings.js");
        const results = await installSettings(item, ["claude"], "project", "copy", true, "/test/project");
        expect(results[0]?.success).toBe(true);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Live URL validation — only with SEEDR_LIVE=true
// Verifies every externalUrl is reachable and content files are valid.
// ---------------------------------------------------------------------------

// Use conditional block instead of describe.runIf to avoid registering skipped tests
if (!LIVE) { /* noop — run with SEEDR_LIVE=true to enable */ } else describe("manifest URL validation (live)", () => {
  function toRawUrl(externalUrl: string): string {
    return externalUrl
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/tree/", "/");
  }

  for (const item of manifest.items) {
    if (!item.externalUrl) continue;

    it(`${item.slug} (${item.type}) — content reachable`, async () => {
      const rawBase = toRawUrl(item.externalUrl!);

      if (item.type === "skill") {
        const res = await fetch(`${rawBase}/SKILL.md`);
        expect(res.status, `SKILL.md missing for ${item.slug}`).toBe(200);
        const text = await res.text();
        expect(text, `SKILL.md has no frontmatter for ${item.slug}`).toContain("---");
      } else if (item.type === "plugin") {
        const res = await fetch(`${rawBase}/.claude-plugin/plugin.json`);
        expect(res.status, `plugin.json missing for ${item.slug}`).toBe(200);
        const json = (await res.json()) as { name?: string };
        expect(json.name, `plugin.json missing "name" for ${item.slug}`).toBeDefined();
      } else if (item.type === "hook" && item.contents?.files) {
        for (const file of item.contents.files) {
          if (file.type === "file") {
            const res = await fetch(`${rawBase}/${file.name}`);
            expect(res.status, `${file.name} missing for ${item.slug}`).toBe(200);
          }
        }
      }
    }, 30_000);
  }
});
