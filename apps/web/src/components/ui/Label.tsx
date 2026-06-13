import type { LucideIcon } from "lucide-react";

import type { BadgeColor } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";

// Literal class strings so Tailwind's source scanner generates them.
// Colors map to per-theme --badge-* variables (defined in index.css) so they
// stay legible on both the light (warm/paper) and dark (green/mono) themes.
const colorClasses: Record<BadgeColor, string> = {
  neutral: "border-border text-muted-foreground",
  green: "border-(--badge-green)/50 text-(--badge-green)",
  red: "border-(--badge-red)/50 text-(--badge-red)",
  blue: "border-(--badge-blue)/50 text-(--badge-blue)",
  orange: "border-(--badge-orange)/50 text-(--badge-orange)",
  purple: "border-(--badge-purple)/50 text-(--badge-purple)",
  amber: "border-(--badge-amber)/50 text-(--badge-amber)",
  emerald: "border-(--badge-emerald)/50 text-(--badge-emerald)",
  indigo: "border-(--badge-indigo)/50 text-(--badge-indigo)",
  teal: "border-(--badge-teal)/50 text-(--badge-teal)",
  violet: "border-(--badge-violet)/50 text-(--badge-violet)",
  pink: "border-(--badge-pink)/50 text-(--badge-pink)",
};

interface LabelProps {
  text: string;
  accentColor: BadgeColor;
  icon?: LucideIcon;
  tooltip: { title?: string; description: string };
  size?: "sm" | "md";
  className?: string;
}

/** Colored badge with border-focused styling and a tooltip (replaces @toolr/ui-design's Label). */
export function Label({ text, accentColor, icon: Icon, tooltip, size = "sm", className }: LabelProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "badge cursor-help border",
            size === "sm" ? "badge-sm gap-1" : "badge-md gap-1.5",
            colorClasses[accentColor],
            className
          )}
        >
          {Icon && <Icon className="size-3" />}
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {tooltip.title && <p className="font-semibold">{tooltip.title}</p>}
        <p>{tooltip.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
