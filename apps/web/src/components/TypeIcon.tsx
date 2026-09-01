import {
  Sparkles,
  Anchor,
  Bot,
  Terminal,
  Settings,
  Server,
  Puzzle,
} from "lucide-react";
import type { ComponentType } from "@/lib/types";
import { typeTextColors } from "@/lib/colors";

const typeIcons: Record<ComponentType, typeof Sparkles> = {
  skill: Sparkles,
  hook: Anchor,
  agent: Bot,
  plugin: Puzzle,
  command: Terminal,
  settings: Settings,
  mcp: Server,
};

interface TypeIconProps {
  type: ComponentType;
  size?: number;
  className?: string;
}

export function TypeIcon({ type, size = 16, className = "" }: TypeIconProps) {
  const Icon = typeIcons[type];
  // rem, not px. `size` stays a pixel number so every call site is unchanged, but an inline
  // `width: 16px` is the one thing no stylesheet can override — it beat the design system's icon
  // rule outright, and these icons stayed frozen while the rest of the page doubled on a 4K
  // display. Dividing by the 16px baseline gives the identical rendering at 1920 and lets the
  // icon grow with the fluid root font-size above it.
  const rem = `${size / 16}rem`;
  return <Icon className={`${typeTextColors[type]} ${className}`} style={{ width: rem, height: rem }} />;
}

export { typeIcons };
