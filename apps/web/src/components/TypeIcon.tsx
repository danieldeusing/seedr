// toolr-design-ignore-next-line
import {
  Sparkles,
  Webhook,
  Bot,
  Terminal,
  Settings,
  Plug,
  Package,
} from "lucide-react";
import type { ComponentType } from "@/lib/types";
import { typeTextColors } from "@/lib/colors";

const typeIcons: Record<ComponentType, typeof Sparkles> = {
  skill: Sparkles,
  hook: Webhook,
  agent: Bot,
  plugin: Package,
  command: Terminal,
  settings: Settings,
  mcp: Plug,
};

interface TypeIconProps {
  type: ComponentType;
  size?: number;
  className?: string;
}

export function TypeIcon({ type, size = 16, className = "" }: TypeIconProps) {
  const Icon = typeIcons[type];
  return <Icon className={`${typeTextColors[type]} ${className}`} style={{ width: size, height: size }} />;
}

export { typeIcons };
