import type { CodingAgent } from "@/lib/types";
import { agentLabels } from "@/lib/colors";
import { CodingAgentIcon } from "./ui/CodingAgentIcon";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/Tooltip";

interface CompatibilityBadgesProps {
  tools: CodingAgent[];
  className?: string;
  size?: "sm" | "md";
}

const iconSizes = { sm: 16, md: 24 };
const gapSizes = { sm: "gap-1.5", md: "gap-2" };

export function CompatibilityBadges({
  tools,
  className = "",
  size = "sm",
}: CompatibilityBadgesProps) {
  return (
    <div className={`flex flex-wrap ${gapSizes[size]} ${className}`}>
      {tools.map((tool) => (
        <Tooltip key={tool}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <CodingAgentIcon agent={tool} size={iconSizes[size]} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{agentLabels[tool]}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
