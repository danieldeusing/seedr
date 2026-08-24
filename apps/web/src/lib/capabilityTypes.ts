import { typeIcons } from "@/components/TypeIcon";
import { typeLabels, typeLabelPlural } from "@/lib/colors";
import type { ComponentType } from "@/lib/types";

/**
 * The capability types a plugin can bundle, in display order.
 *
 * Icons and labels are derived, never restated: a second copy had already
 * drifted (hook rendered Anchor here and Webhook there, mcp Server vs Plug),
 * so the same type showed two different glyphs on one page.
 */
const CAPABILITY_TYPES: ComponentType[] = ["skill", "agent", "hook", "command", "mcp"];

export const capabilityTypes = CAPABILITY_TYPES.map((type) => ({
  type,
  icon: typeIcons[type],
  label: typeLabels[type],
  labelPlural: typeLabelPlural[type],
}));
