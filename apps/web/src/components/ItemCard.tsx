import { Link } from "react-router-dom";
// toolr-design-ignore-next-line
import { Clock, Package, Plug, Puzzle } from "lucide-react";
import { Card } from "./ui/Card";
import { CodingAgentIcon } from "./ui/CodingAgentIcon";
import { Label } from "./ui/Label";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/Tooltip";
import { TypeIcon } from "./TypeIcon";
import { SourceBadge } from "./SourceBadge";
import { ScopeBadge } from "./ScopeBadge";
import { formatRelativeTime } from "@/lib/text";
import { typeLabels, typeTextColors, agentLabels, pluginTypeToBadgeColor } from "@/lib/colors";
import { capabilityTypes } from "@/lib/capabilityTypes";
import type { RegistryItem, SourceType, ScopeType, CodingAgent, PluginType } from "@/lib/types";

function PackageBadges({ counts }: { counts: Record<string, number> }) {
  const items = capabilityTypes
    .map(({ type, icon, label, labelPlural }) => {
      const count = counts[type];
      if (!count || count <= 0) return null;
      return { type, icon, label: count === 1 ? label : labelPlural, count };
    })
    .filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {items.map((item) => {
        if (!item) return null;
        const Icon = item.icon;
        const colorClass = typeTextColors[item.type as keyof typeof typeTextColors];
        return (
          <Tooltip key={item.type}>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-0.5">
                <Icon className={`w-3 h-3 ${colorClass}`} />
                <span className="text-xss text-subtext">{item.count}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{`${item.count} ${item.label}`}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Wraps a click handler to stop event propagation (prevents Link navigation). */
function clickable(handler?: () => void) {
  if (!handler) return undefined;
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  };
}

interface ItemCardProps {
  item: RegistryItem;
  browseType?: string;
  onSourceClick?: (source: SourceType) => void;
  onScopeClick?: (scope: ScopeType) => void;
  onToolClick?: (agent: CodingAgent) => void;
  onPluginTypeClick?: (pluginType: PluginType) => void;
  onDateClick?: () => void;
}

export function ItemCard({ item, browseType, onSourceClick, onScopeClick, onToolClick, onPluginTypeClick, onDateClick }: ItemCardProps) {
  const interactive = "cursor-pointer hover:brightness-125 transition-all";

  return (
    <Link to={`/${item.type}s/${item.slug}`} state={browseType && item.type !== browseType ? { from: browseType } : undefined}>
      <Card className="h-full flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            {item.sourceType && (
              <span onClick={clickable(onSourceClick ? () => onSourceClick(item.sourceType!) : undefined)} className={onSourceClick ? interactive : ""}>
                <SourceBadge source={item.sourceType} />
              </span>
            )}
            {item.pluginType === "package" && (
              <span onClick={clickable(onPluginTypeClick ? () => onPluginTypeClick("package") : undefined)} className={onPluginTypeClick ? interactive : ""}>
                <Label text="Package" accentColor={pluginTypeToBadgeColor.package} icon={Package} tooltip={{ description: "Bundles multiple capabilities (skills, hooks, agents, etc.) into a single plugin" }} />
              </span>
            )}
            {item.pluginType === "wrapper" && (
              <span onClick={clickable(onPluginTypeClick ? () => onPluginTypeClick("wrapper") : undefined)} className={onPluginTypeClick ? interactive : ""}>
                <Label text="Wrapper" accentColor={pluginTypeToBadgeColor.wrapper} icon={Puzzle} tooltip={{ description: `Wraps a single ${item.wrapper} capability as a plugin` }} />
              </span>
            )}
            {item.pluginType === "integration" && (
              <span onClick={clickable(onPluginTypeClick ? () => onPluginTypeClick("integration") : undefined)} className={onPluginTypeClick ? interactive : ""}>
                <Label text="Integration" accentColor={pluginTypeToBadgeColor.integration} icon={Plug} tooltip={{ description: "Integrates an external tool with your AI assistant. Installing adds it to enabledPlugins — the README explains how to set up the tool itself." }} />
              </span>
            )}
            {item.sourceType === "toolr" && item.targetScope && (
              <span onClick={clickable(onScopeClick ? () => onScopeClick(item.targetScope!) : undefined)} className={onScopeClick ? interactive : ""}>
                <ScopeBadge scope={item.targetScope} />
              </span>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <TypeIcon type={item.type} size={16} className="opacity-60" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{typeLabels[item.type]}</TooltipContent>
          </Tooltip>
        </div>

        <h3 className="text-sm font-medium text-text mb-0.5">{item.name}</h3>
        {(item.author || item.sourceType === "toolr") && (
          <p className="text-xs text-text-dim mb-1.5">
            by {item.sourceType === "toolr" ? "Daniel Deusing" : item.author?.name}
          </p>
        )}
        <p className="text-subtext text-xs mb-3 flex-grow line-clamp-2">{item.description}</p>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {item.compatibility.map((tool) => (
              <Tooltip key={tool}>
                <TooltipTrigger asChild>
                  <span onClick={clickable(onToolClick ? () => onToolClick(tool) : undefined)} className={`inline-flex ${onToolClick ? interactive : ""}`}>
                    <CodingAgentIcon agent={tool} size={16} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">{agentLabels[tool]}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          {(item.package || item.wrapper) && (
            <PackageBadges counts={item.package ?? { [item.wrapper!]: 1 }} />
          )}
          {item.updatedAt && (
            <span
              onClick={clickable(onDateClick)}
              className={`flex items-center gap-1 text-xss text-text-dim ${onDateClick ? interactive : ""}`}
            >
              <Clock className="w-3 h-3" />
              {formatRelativeTime(item.updatedAt)}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
