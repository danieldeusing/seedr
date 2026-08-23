import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RegistryItem } from "@seedr/shared";
import { compileRegistry } from "../compile.js";

export const LONG = "Reads `item.json` files and " + "checks every description carefully ".repeat(10);

export const toolrSkill: RegistryItem = {
  slug: "alpha",
  name: "Alpha",
  type: "skill",
  description: "Does alpha things.",
  longDescription: LONG,
  compatibility: ["claude"],
  sourceType: "toolr",
  author: { name: "Test Author" },
  contents: { files: [{ name: "SKILL.md", type: "file" }] },
};

export const communityPlugin: RegistryItem = {
  slug: "beta",
  name: "Beta",
  type: "plugin",
  description: "Does beta things.",
  longDescription: LONG,
  compatibility: ["claude", "codex"],
  sourceType: "community",
  pluginType: "wrapper",
  wrapper: "skill",
  author: { name: "Someone", url: "https://github.com/someone" },
  externalUrl: "https://github.com/someone/beta/tree/main",
  contents: { files: [{ name: "README.md", type: "file" }] },
};

export const officialSkill: RegistryItem = {
  slug: "gamma",
  name: "Gamma",
  type: "skill",
  description: "Does gamma things.",
  longDescription: LONG,
  compatibility: ["claude"],
  sourceType: "official",
  author: { name: "Anthropic" },
  externalUrl: "https://github.com/anthropics/skills/tree/main/skills/gamma",
};

export const toolrMcp: RegistryItem = {
  slug: "delta",
  name: "Delta",
  type: "mcp",
  description: "Serves delta.",
  longDescription: LONG,
  compatibility: ["claude"],
  sourceType: "toolr",
  author: { name: "Test Author" },
};

export function writeItem(registryDir: string, typeDir: string, item: RegistryItem, files: Record<string, string> = {}): string {
  const dir = join(registryDir, typeDir, item.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "item.json"), JSON.stringify(item, null, 2) + "\n");
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

/** A temp registry with four items across skills, plugins and mcp. Returns the registry dir. */
export function makeRegistry(): string {
  const registryDir = join(mkdtempSync(join(tmpdir(), "seedr-registry-ops-")), "registry");
  mkdirSync(registryDir);
  writeItem(registryDir, "skills", toolrSkill, { "SKILL.md": "# Alpha\n", "references/notes.md": "notes\n" });
  writeItem(registryDir, "plugins", communityPlugin);
  writeItem(registryDir, "skills", officialSkill);
  writeItem(registryDir, "mcp", toolrMcp, { "mcp.md": "config\n" });
  return registryDir;
}

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trimEnd();

/** A temp git repo whose `registry/` is `makeRegistry()`'s contents, compiled and committed. Returns the repo root. */
export function makeRepo(): string {
  const registryDir = makeRegistry();
  compileRegistry(registryDir);
  const repoRoot = join(registryDir, "..");
  git(repoRoot, "init", "-q");
  git(repoRoot, "add", "-A");
  git(repoRoot, "commit", "-qm", "fixture");
  return repoRoot;
}
