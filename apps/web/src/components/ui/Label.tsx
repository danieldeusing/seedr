import type { LucideIcon } from "lucide-react";

import type { BadgeColor } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";

// Literal class strings so Tailwind's source scanner generates them.
const colorClasses: Record<BadgeColor, string> = {
  neutral: "border-neutral-500/50 text-neutral-500",
  green: "border-green-500/50 text-green-500",
  red: "border-red-500/50 text-red-500",
  blue: "border-blue-500/50 text-blue-500",
  orange: "border-orange-500/50 text-orange-500",
  purple: "border-purple-500/50 text-purple-500",
  amber: "border-amber-500/50 text-amber-500",
  emerald: "border-emerald-500/50 text-emerald-500",
  indigo: "border-indigo-500/50 text-indigo-500",
  teal: "border-teal-500/50 text-teal-500",
  violet: "border-violet-500/50 text-violet-500",
  pink: "border-pink-500/50 text-pink-500",
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
