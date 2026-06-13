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
import { typeLabels, typeTextColors, agentLabels, pluginTypeToBadgeColor, typeToPath } from "@/lib/colors";
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
                <span className="text-[11px] text-subtext">{item.count}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{`${item.count} ${item.label}`}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Props that turn a span inside the card Link into an accessible button:
 * stops the click from navigating, and adds keyboard (Enter/Space) + role so
 * the filter affordance works without a mouse. Returns {} when no handler.
 */
function interactiveProps(handler?: () => void) {
  if (!handler) return {};
  const activate = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  };
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: activate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") activate(e);
    },
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
    <Link to={`/${typeToPath[item.type]}/${item.slug}`} state={browseType && item.type !== browseType ? { from: browseType } : undefined}>
      <Card className="h-full flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            {item.sourceType && (
              <span {...interactiveProps(onSourceClick ? () => onSourceClick(item.sourceType!) : undefined)} className={onSourceClick ? interactive : ""}>
                <SourceBadge source={item.sourceType} />
              </span>
            )}
            {item.pluginType === "package" && (
              <span {...interactiveProps(onPluginTypeClick ? () => onPluginTypeClick("package") : undefined)} className={onPluginTypeClick ? interactive : ""}>
                <Label text="Package" accentColor={pluginTypeToBadgeColor.package} icon={Package} tooltip={{ description: "Bundles multiple capabilities (skills, hooks, agents, etc.) into a single plugin" }} />
              </span>
            )}
            {item.pluginType === "wrapper" && (
              <span {...interactiveProps(onPluginTypeClick ? () => onPluginTypeClick("wrapper") : undefined)} className={onPluginTypeClick ? interactive : ""}>
                <Label text="Wrapper" accentColor={pluginTypeToBadgeColor.wrapper} icon={Puzzle} tooltip={{ description: `Wraps a single ${item.wrapper} capability as a plugin` }} />
              </span>
            )}
            {item.pluginType === "integration" && (
              <span {...interactiveProps(onPluginTypeClick ? () => onPluginTypeClick("integration") : undefined)} className={onPluginTypeClick ? interactive : ""}>
                <Label text="Integration" accentColor={pluginTypeToBadgeColor.integration} icon={Plug} tooltip={{ description: "Integrates an external tool with your AI assistant. Installing adds it to enabledPlugins — the README explains how to set up the tool itself." }} />
              </span>
            )}
            {item.sourceType === "toolr" && item.targetScope && (
              <span {...interactiveProps(onScopeClick ? () => onScopeClick(item.targetScope!) : undefined)} className={onScopeClick ? interactive : ""}>
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
          <p className="text-[11px] text-text-dim mb-3">
            by {item.sourceType === "toolr" ? "Daniel Deusing" : item.author?.name}
          </p>
        )}
        <p className="text-subtext text-xs mb-5 flex-grow line-clamp-3">{item.description}</p>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {item.compatibility.map((tool) => (
              <Tooltip key={tool}>
                <TooltipTrigger asChild>
                  <span {...interactiveProps(onToolClick ? () => onToolClick(tool) : undefined)} className={`inline-flex ${onToolClick ? interactive : ""}`}>
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
              {...interactiveProps(onDateClick)}
              className={`flex items-center gap-1 text-[11px] text-text-dim ${onDateClick ? interactive : ""}`}
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
