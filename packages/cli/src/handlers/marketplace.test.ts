/**
 * Marketplace resolution smoke tests.
 *
 * Reads the real manifest and verifies every plugin has a valid marketplace field.
 *
 * Mocked (default):  pnpm test -- marketplace
 *   - Every plugin has a non-empty `marketplace` field
 *   - Marketplace doesn't match author name (which means sync fell back)
 *
 * Live validation (SEEDR_LIVE=true):  SEEDR_LIVE=true pnpm test -- marketplace
 *   - Fetches marketplace.json from each plugin's repo root
 *   - Verifies stored marketplace matches the remote value
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RegistryItem } from "@seedr/shared";

// Read real manifest (sync fs, unaffected by memfs mocks)
const __testDir = dirname(fileURLToPath(import.meta.url));
const registryDir = join(__testDir, "../../../../registry");
const indexData = JSON.parse(
  readFileSync(join(registryDir, "manifest.json"), "utf-8")
);
const items: RegistryItem[] = [];
for (const desc of Object.values(indexData.types) as { file: string }[]) {
  const typeData = JSON.parse(
    readFileSync(join(registryDir, desc.file), "utf-8")
  );
  items.push(...typeData.items);
}

const plugins = items.filter((i) => i.type === "plugin");
const LIVE = process.env.SEEDR_LIVE === "true";

// ---------------------------------------------------------------------------
// Mocked — run on every build
// ---------------------------------------------------------------------------

describe("plugin marketplace field", () => {
  for (const item of plugins) {
    it(`${item.slug} has marketplace set`, () => {
      expect(
        item.marketplace,
        `missing marketplace field`
      ).toBeDefined();
      expect(item.marketplace, `empty marketplace`).not.toBe("");

      // Marketplace should not match author name — that's the fallback bug
      // (a sync that couldn't find marketplace.json would produce author name)
      if (item.author?.name) {
        expect(
          item.marketplace,
          `marketplace "${item.marketplace}" matches author "${item.author.name}" — likely not resolved from marketplace.json`
        ).not.toBe(item.author.name);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Live validation — only with SEEDR_LIVE=true
// Fetches marketplace.json from each repo root and verifies stored value.
// ---------------------------------------------------------------------------

if (!LIVE) {
  /* noop — run with SEEDR_LIVE=true to enable */
} else
  describe("plugin marketplace validation (live)", () => {
    function getRepoFromUrl(url: string): string | null {
      const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
      return match?.[1]?.replace(/\.git$/, "") ?? null;
    }

    // Cache fetches per repo (many plugins share the same repo)
    const cache = new Map<string, Promise<string | null>>();

    function fetchMarketplaceName(repo: string): Promise<string | null> {
      if (!cache.has(repo)) {
        cache.set(
          repo,
          (async () => {
            const url = `https://raw.githubusercontent.com/${repo}/main/.claude-plugin/marketplace.json`;
            try {
              const res = await fetch(url);
              if (!res.ok) return null;
              const json = (await res.json()) as { name?: string };
              return json.name ?? null;
            } catch {
              return null;
            }
          })()
        );
      }
      return cache.get(repo)!;
    }

    for (const item of plugins) {
      if (!item.externalUrl) continue;

      it(
        `${item.slug} marketplace matches repo`,
        async () => {
          const repo = getRepoFromUrl(item.externalUrl!);
          expect(
            repo,
            `couldn't parse repo from ${item.externalUrl}`
          ).not.toBeNull();

          const remoteName = await fetchMarketplaceName(repo!);
          if (remoteName) {
            expect(
              item.marketplace,
              `stored "${item.marketplace}" but repo has "${remoteName}"`
            ).toBe(remoteName);
          }
        },
        30_000
      );
    }
  });
