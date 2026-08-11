import { Shield } from "lucide-react";
import { Label } from "./ui/Label";
import { sourceToBadgeColor, sourceLabels } from "@/lib/colors";
import type { SourceType } from "@/lib/types";

const sourceDescriptions: Record<SourceType, string> = {
  official: "Published by the tool maker",
  toolr: "Published by Daniel Deusing",
  community: "Community contribution",
};

interface SourceBadgeProps {
  source: SourceType;
  className?: string;
  size?: "sm" | "md";
}

export function SourceBadge({ source, className = "", size = "sm" }: SourceBadgeProps) {
  return (
    <Label
      text={sourceLabels[source]}
      accentColor={sourceToBadgeColor[source]}
      icon={Shield}
      size={size}
      tooltip={{ title: sourceLabels[source], description: sourceDescriptions[source] }}
      className={className}
    />
  );
}
