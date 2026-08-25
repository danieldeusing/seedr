import { Tag } from "lucide-react";
import { Label } from "./ui/Label";
import type { LabelDefinition } from "@/lib/types";

interface LabelBadgeProps {
  label: LabelDefinition;
  className?: string;
  size?: "sm" | "md";
}

export function LabelBadge({ label, className = "", size = "sm" }: LabelBadgeProps) {
  return (
    <Label
      text={label.name}
      accentColor={label.color}
      icon={Tag}
      size={size}
      tooltip={{
        title: label.name,
        description: `Grouped under the ${label.name} label.`,
      }}
      className={className}
    />
  );
}
