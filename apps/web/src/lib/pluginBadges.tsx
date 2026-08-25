import { Package, Puzzle, Plug } from "lucide-react";
import type { PluginType, RegistryItem } from "@/lib/types";

/**
 * How a plugin's classification is presented, in one place.
 *
 * The card and the detail page both show this; two copies of the same prose
 * meant a reworded tooltip would describe the same plugin differently
 * depending on where you were looking.
 */
export const PLUGIN_TYPE_BADGES: Record<
  PluginType,
  { text: string; icon: typeof Package; description: (item: RegistryItem) => string }
> = {
  package: {
    text: "Package",
    icon: Package,
    description: () => "Bundles multiple capabilities (skills, hooks, agents, etc.) into a single plugin",
  },
  wrapper: {
    text: "Wrapper",
    icon: Puzzle,
    description: (item) => `Wraps a single ${item.wrapper} capability as a plugin`,
  },
  integration: {
    text: "Integration",
    icon: Plug,
    description: () =>
      "Integrates an external tool with your AI assistant. Installing adds it to enabledPlugins — the README explains how to set up the tool itself.",
  },
};
