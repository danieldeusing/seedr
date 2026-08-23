/**
 * A small but realistic upstream world for the sync tests: the official skills repo, the
 * official marketplace with every source form, two url/git-subdir targets and a few
 * community repositories — plus a pre-migration registry that references them.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ManifestItem } from "../sync/types.js";
import { FakeGitHub, SHA_A, SHA_B, SHA_C, SHA_D, emptyRegistry, writeItem, type FakeRepo } from "./fake-github.js";

export const SHA_E = "e".repeat(40);
export const SHA_F = "f".repeat(40);
export const SHA_1 = "1".repeat(40);
export const SHA_2 = "2".repeat(40);

export const MIT = "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n";
export const APACHE = "Apache License\nVersion 2.0, January 2004\n";

const pluginJson = (name: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name, description: `${name} from plugin.json`, version: "0.1.0", author: { name: `${name} author` }, ...extra });

export function officialMarketplace(overrides: { plugins?: unknown[]; renames?: Record<string, string> } = {}): string {
  return JSON.stringify({
    $schema: "https://json.schemastore.org/claude-code-marketplace.json",
    name: "claude-plugins-official",
    owner: { name: "Anthropic" },
    renames: overrides.renames ?? {},
    plugins: overrides.plugins ?? [
      { name: "code-review", description: "Review PRs", source: "./plugins/code-review", author: { name: "Anthropic", email: "s@a.com" }, category: "development" },
      {
        name: "clangd-lsp",
        description: "C/C++ language server",
        version: "1.0.0",
        author: { name: "Anthropic" },
        source: "./plugins/clangd-lsp",
        strict: false,
        lspServers: { clangd: { command: "clangd", args: ["--background-index"] } },
      },
      { name: "asana", description: "Asana MCP", source: "./external_plugins/asana", author: { name: "Asana" } },
      { name: "new-one", description: "Brand new official plugin", source: "./plugins/new-one", author: { name: "Anthropic" } },
      { name: "slack", description: "Slack workspace integration", source: { source: "url", url: "https://github.com/slackapi/slack-mcp-plugin.git", sha: SHA_C } },
      {
        name: "stripe",
        description: "Stripe development plugin",
        source: { source: "git-subdir", url: "https://github.com/stripe/ai.git", path: "providers/claude/plugin", ref: "main", sha: SHA_D },
      },
      { name: "not-ours", description: "Third-party plugin we do not carry", source: { source: "url", url: "https://github.com/other/plugin.git", sha: SHA_E } },
    ],
  });
}

export function makeRepos(): Record<string, FakeRepo> {
  return {
    "anthropics/skills": {
      branches: { main: SHA_A },
      commits: {
        [SHA_A]: {
          date: "2026-03-01T00:00:00Z",
          files: {
            "README.md": "skills\n",
            "THIRD_PARTY_NOTICES.md": "notices\n",
            "skills/pdf/SKILL.md": "---\nname: pdf\ndescription: Work with PDF files\n---\n# PDF\n",
            "skills/pdf/LICENSE.txt": MIT,
            "skills/pdf/scripts/a.py": "print(1)\n",
            "skills/docx/SKILL.md": "---\nname: docx\ndescription: Work with Word files\n---\n",
          },
        },
      },
    },
    "anthropics/claude-plugins-official": {
      branches: { main: SHA_B },
      commits: {
        [SHA_B]: {
          date: "2026-03-02T00:00:00Z",
          files: {
            ".claude-plugin/marketplace.json": officialMarketplace(),
            LICENSE: MIT,
            "README.md": "plugins\n",
            "plugins/code-review/.claude-plugin/plugin.json": pluginJson("code-review"),
            "plugins/code-review/commands/review.md": "# review\n",
            "plugins/clangd-lsp/README.md": "# clangd\n",
            "plugins/clangd-lsp/LICENSE": MIT,
            "plugins/new-one/.claude-plugin/plugin.json": pluginJson("new-one"),
            "plugins/new-one/skills/one/SKILL.md": "---\nname: one\n---\n",
            "plugins/example-plugin/.claude-plugin/plugin.json": pluginJson("example-plugin"),
            "external_plugins/asana/.claude-plugin/plugin.json": pluginJson("asana", { author: { name: "Asana", url: "https://asana.com" } }),
            "external_plugins/asana/.mcp.json": JSON.stringify({ mcpServers: { asana: { url: "https://mcp.asana.com" } } }),
          },
        },
      },
    },
    "slackapi/slack-mcp-plugin": {
      branches: { main: SHA_C },
      commits: {
        [SHA_C]: {
          date: "2026-03-03T00:00:00Z",
          files: {
            ".claude-plugin/plugin.json": pluginJson("slack", { author: { name: "Slack" } }),
            ".mcp.json": JSON.stringify({ mcpServers: { slack: { url: "https://mcp.slack.com" } } }),
            LICENSE: MIT,
            "skills/search/SKILL.md": "---\nname: search\n---\n",
            "AGENTS.md": { symlink: "README.md" },
          },
        },
      },
    },
    "stripe/ai": {
      branches: { main: SHA_D },
      commits: {
        [SHA_D]: {
          date: "2026-03-04T00:00:00Z",
          files: {
            LICENSE: APACHE,
            "providers/claude/plugin/.claude-plugin/plugin.json": pluginJson("stripe"),
            "providers/claude/plugin/commands/a.md": "# a\n",
            "providers/claude/plugin/commands/b.md": "# b\n",
            "providers/other/ignored.md": "ignored\n",
          },
        },
      },
    },
    "other/plugin": {
      branches: { main: SHA_E },
      commits: { [SHA_E]: { files: { ".claude-plugin/plugin.json": pluginJson("not-ours") } } },
    },
    "obra/superpowers": {
      branches: { main: SHA_F },
      commits: {
        [SHA_F]: {
          date: "2026-03-05T00:00:00Z",
          files: {
            ".claude-plugin/marketplace.json": JSON.stringify({ name: "superpowers-dev", plugins: [{ name: "superpowers", source: "./", version: "6.0.0" }] }),
            ".claude-plugin/plugin.json": pluginJson("superpowers"),
            LICENSE: MIT,
            "skills/tdd/SKILL.md": "---\nname: tdd\n---\n",
            "hooks/hooks.json": JSON.stringify({ hooks: { SessionStart: [] } }),
          },
        },
      },
    },
    "pbakaus/agent-reviews": {
      branches: { main: SHA_1 },
      commits: {
        [SHA_1]: {
          date: "2026-03-06T00:00:00Z",
          files: {
            ".claude-plugin/marketplace.json": JSON.stringify({
              name: "agent-reviews",
              plugins: [{ name: "resolve-reviews", source: "./" }, { name: "resolve-agent-reviews", source: "./" }],
            }),
            ".claude-plugin/plugin.json": pluginJson("agent-reviews-root"),
            LICENSE: MIT,
            "skills/resolve-reviews/SKILL.md": "---\nname: resolve-reviews\n---\n",
          },
        },
      },
    },
    "every/compound": {
      branches: { main: SHA_2 },
      commits: {
        [SHA_2]: {
          date: "2026-03-07T00:00:00Z",
          files: {
            ".claude-plugin/marketplace.json": JSON.stringify({ name: "compound-engineering-plugin", plugins: [{ name: "compound-engineering", source: "./plugin", version: "2.0.0" }] }),
            "plugin/.claude-plugin/plugin.json": pluginJson("compound-engineering"),
            "plugin/agents/a.md": "# a\n",
            "plugin/skills/s/SKILL.md": "---\nname: s\n---\n",
            "README.md": "repo readme\n",
            LICENSE: MIT,
          },
        },
      },
    },
    "vercel-labs/agent-skills": {
      branches: { main: SHA_2 },
      commits: {
        [SHA_2]: {
          date: "2026-03-08T00:00:00Z",
          files: {
            "skills/react-best-practices/SKILL.md": "---\nname: react-best-practices\ndescription: React guidelines\n---\n",
            "skills/react-best-practices/rules/a.md": "rule\n",
            LICENSE: MIT,
          },
        },
      },
    },
  };
}

const AUTHOR = { name: "Daniel Deusing", url: "https://github.com/danieldeusing" };
const LONG = "A long description with `code` that is certainly more than thirty words long so that the description checker is satisfied when it runs over this item in a test registry.";

export function makeExistingRegistry(registryDir: string): Record<string, ManifestItem> {
  emptyRegistry(registryDir);
  const items: Record<string, ManifestItem> = {
    agentwatch: {
      slug: "agentwatch",
      name: "Agentwatch",
      type: "hook",
      description: "Track sessions.",
      longDescription: LONG,
      compatibility: ["claude"],
      sourceType: "toolr",
      author: AUTHOR,
      externalUrl: "https://github.com/danieldeusing/seedr/tree/main/registry/hooks/agentwatch",
      contents: { files: [{ name: "agentwatch.sh", type: "file" }], triggers: [{ event: "SessionStart" }] },
    },
    pdf: {
      slug: "pdf",
      name: "PDF (curated name)",
      type: "skill",
      description: "old description",
      longDescription: LONG,
      compatibility: ["claude", "codex"],
      featured: true,
      sourceType: "official",
      author: { name: "Anthropic" },
      externalUrl: "https://github.com/anthropics/skills/tree/main/skills/pdf",
      contentHash: "0000000000000000",
      contents: { files: [{ name: "SKILL.md", type: "file" }] },
      updatedAt: "2026-01-01T00:00:00Z",
    },
    docx: {
      slug: "docx",
      name: "Docx",
      type: "skill",
      description: "old",
      compatibility: ["claude"],
      sourceType: "official",
      author: { name: "Anthropic" },
      externalUrl: "https://github.com/anthropics/skills/tree/main/skills/docx",
    },
    "stale-skill": {
      slug: "stale-skill",
      name: "Stale",
      type: "skill",
      description: "removed upstream",
      compatibility: ["claude"],
      sourceType: "official",
      author: { name: "Anthropic" },
      externalUrl: "https://github.com/anthropics/skills/tree/main/skills/stale-skill",
    },
    "code-review": {
      slug: "code-review",
      name: "Code Review",
      type: "plugin",
      description: "old",
      longDescription: LONG,
      compatibility: ["claude"],
      pluginType: "wrapper",
      wrapper: "command",
      sourceType: "official",
      author: { name: "Anthropic" },
      externalUrl: "https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-review",
      marketplace: "claude-plugins-official",
    },
    "clangd-lsp": {
      slug: "clangd-lsp",
      name: "Clangd LSP",
      type: "plugin",
      description: "old",
      compatibility: ["claude"],
      pluginType: "package",
      package: {},
      sourceType: "official",
      author: { name: "Anthropic" },
      externalUrl: "https://github.com/anthropics/claude-plugins-official/tree/main/plugins/clangd-lsp",
      marketplace: "claude-plugins-official",
    },
    asana: {
      slug: "asana",
      name: "Asana",
      type: "plugin",
      description: "old",
      compatibility: ["claude"],
      pluginType: "wrapper",
      wrapper: "mcp",
      sourceType: "community",
      author: { name: "Asana" },
      externalUrl: "https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/asana",
      marketplace: "claude-plugins-official",
    },
    slack: {
      slug: "slack",
      name: "Slack",
      type: "plugin",
      description: "old",
      compatibility: ["claude"],
      pluginType: "wrapper",
      wrapper: "mcp",
      sourceType: "community",
      author: { name: "Slack" },
      externalUrl: "https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/slack",
      marketplace: "claude-plugins-official",
    },
    stripe: {
      slug: "stripe",
      name: "Stripe",
      type: "plugin",
      description: "old",
      compatibility: ["claude"],
      pluginType: "package",
      package: { command: 2 },
      sourceType: "community",
      author: { name: "Stripe", url: "https://stripe.com" },
      externalUrl: "https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/stripe",
      marketplace: "claude-plugins-official",
    },
    superpowers: {
      slug: "superpowers",
      name: "Superpowers",
      type: "plugin",
      description: "old",
      compatibility: ["claude"],
      pluginType: "package",
      package: { skill: 1, hook: 1 },
      sourceType: "community",
      author: { name: "Jesse Vincent" },
      externalUrl: "https://github.com/obra/superpowers/tree/main",
      marketplace: "superpowers-dev",
    },
    "agent-reviews": {
      slug: "agent-reviews",
      name: "Agent Reviews",
      type: "plugin",
      description: "old",
      compatibility: ["claude"],
      pluginType: "wrapper",
      wrapper: "skill",
      sourceType: "community",
      author: { name: "Paul Bakaus", url: "https://github.com/pbakaus" },
      externalUrl: "https://github.com/pbakaus/agent-reviews",
      marketplace: "agent-reviews",
    },
    "compound-engineering": {
      slug: "compound-engineering",
      name: "Compound Engineering",
      type: "plugin",
      description: "old",
      compatibility: ["claude"],
      pluginType: "package",
      package: { agent: 1, skill: 1 },
      sourceType: "community",
      author: { name: "Every" },
      externalUrl: "https://github.com/every/compound/tree/main/plugins/compound-engineering",
      marketplace: "compound-engineering-plugin",
    },
    "react-best-practices": {
      slug: "react-best-practices",
      name: "React Best Practices",
      type: "skill",
      description: "old",
      compatibility: ["claude", "copilot"],
      sourceType: "community",
      author: { name: "Vercel" },
      externalUrl: "https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices",
    },
  };
  for (const item of Object.values(items)) {
    writeItem(registryDir, item, item.slug === "agentwatch" ? { "agentwatch.sh": "#!/bin/sh\necho hi\n" } : {});
  }
  return items;
}

export interface World {
  registryDir: string;
  fake: FakeGitHub;
  existing: Record<string, ManifestItem>;
}

export function makeWorld(): World {
  const registryDir = mkdtempSync(join(tmpdir(), "seedr-sync-"));
  const existing = makeExistingRegistry(registryDir);
  return { registryDir, fake: new FakeGitHub(makeRepos()), existing };
}
