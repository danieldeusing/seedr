import { writeFileSync } from "node:fs";
import { itemJsonPath } from "./fsPaths.js";
import { canonicalAgents, isLegacyAgent } from "./agents.js";
import { SOURCE_TYPE_ALIASES, isLegacySourceType } from "./sourceTypes.js";
import { compileRegistry } from "./compile.js";
import { listItems } from "./read.js";

/**
 * Workstream B2 (plan §5): rewrite every item's `compatibility` to canonical
 * agent ids — `gemini` becomes `antigravity`, duplicates collapse — and
 * recompile. Run once, after a CLI that understands `antigravity` is published;
 * until then the data keeps the old id and every consumer resolves the alias.
 */
export interface MigratedItem {
  type: string;
  slug: string;
  before: string[];
  after: string[];
}

export function migrateAgentIds(registryDir: string): MigratedItem[] {
  const migrated: MigratedItem[] = [];
  for (const { type, slug, item } of listItems(registryDir)) {
    if (!item.compatibility.some(isLegacyAgent)) continue;
    const after = canonicalAgents(item.compatibility);
    writeFileSync(itemJsonPath(registryDir, type, slug), JSON.stringify({ ...item, compatibility: after }, null, 2) + "\n");
    migrated.push({ type, slug, before: item.compatibility, after });
  }
  if (migrated.length > 0) compileRegistry(registryDir);
  return migrated;
}

/**
 * The same flip for source types: rewrite every `sourceType: "toolr"` to
 * `"seedr"` and recompile. Run once, after a CLI that understands `seedr` is
 * published; until then the data keeps the old name and every consumer resolves
 * the alias. Independent of the agent-id flip — the two are gated on different
 * releases.
 */
export interface MigratedSourceType {
  type: string;
  slug: string;
  before: string;
  after: string;
}

export function migrateSourceTypes(registryDir: string): MigratedSourceType[] {
  const migrated: MigratedSourceType[] = [];
  for (const { type, slug, item } of listItems(registryDir)) {
    if (!isLegacySourceType(item.sourceType)) continue;
    const after = SOURCE_TYPE_ALIASES[item.sourceType];
    writeFileSync(itemJsonPath(registryDir, type, slug), JSON.stringify({ ...item, sourceType: after }, null, 2) + "\n");
    migrated.push({ type, slug, before: item.sourceType, after });
  }
  if (migrated.length > 0) compileRegistry(registryDir);
  return migrated;
}
