import { Package, Puzzle, Plug } from "lucide-react";
import { typeLabels } from "@/lib/colors";
import type { ComponentType, PluginType, RegistryItem } from "@/lib/types";

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
    description: (item) => {
      const capability = typeLabels[item.wrapper as ComponentType].toLowerCase();
      return `Packages a single ${capability} as a plugin — installing it adds just that one ${capability}, nothing more.`;
    },
  },
  integration: {
    text: "Integration",
    icon: Plug,
    description: () =>
      "Integrates an external tool with your AI assistant. Installing adds it to enabledPlugins — the README explains how to set up the tool itself.",
  },
};
