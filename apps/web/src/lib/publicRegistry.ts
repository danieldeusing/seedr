import type { RegistryItem } from "./types";

// The public registry's compiled manifests plus the lazy per-item item.json
// loaders. This module is reached ONLY through "virtual:seedr-public-registry":
// the vite plugin resolves that id here normally, or to an empty stub when a
// build sets SEEDR_PRIVATE_REGISTRY without SEEDR_INCLUDE_PUBLIC=true — which
// keeps every public manifest and item.json chunk out of a private-only build.
import indexData from "@registry/manifest.json";
import skillsData from "@registry/skills/manifest.json";
import pluginsData from "@registry/plugins/manifest.json";
import hooksData from "@registry/hooks/manifest.json";
import agentsData from "@registry/agents/manifest.json";
import mcpData from "@registry/mcp/manifest.json";
import settingsData from "@registry/settings/manifest.json";
import commandsData from "@registry/commands/manifest.json";

// Lazy-import item.json files for longDescription lookup (stripped from manifests).
// Each entry is an async () => module, loaded only when requested.
const itemJsonLoaders = import.meta.glob<{ default: RegistryItem }>("@registry/*/*/item.json");

export default {
  version: indexData.version as string,
  items: [
    ...skillsData.items,
    ...pluginsData.items,
    ...hooksData.items,
    ...agentsData.items,
    ...mcpData.items,
    ...settingsData.items,
    ...commandsData.items,
  ] as RegistryItem[],
  itemJsonLoaders,
};
