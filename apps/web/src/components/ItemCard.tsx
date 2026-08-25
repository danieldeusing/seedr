import type { ReactNode } from "react";
import { PLUGIN_TYPE_BADGES } from "@/lib/pluginBadges";
import { Link } from "react-router-dom";
// toolr-design-ignore-next-line
import { Clock,} from "lucide-react";
import { CodingAgentIcon } from "./ui/CodingAgentIcon";
import { Label } from "./ui/Label";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/Tooltip";
import { TypeIcon } from "./TypeIcon";
import { SourceBadge } from "./SourceBadge";
import { ScopeBadge } from "./ScopeBadge";
import { formatRelativeTime } from "@/lib/text";
import { typeLabels, typeTextColors, agentLabels, pluginTypeToBadgeColor, typeToPath, sourceLabels, scopeLabels } from "@/lib/colors";
import { capabilityTypes } from "@/lib/capabilityTypes";
import { cn } from "@/lib/utils";
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
              <span role="img" className="flex items-center gap-0.5" aria-label={`${item.count} ${item.label}`}>
                <Icon className={`w-3 h-3 ${colorClass}`} aria-hidden />
                <span className="text-[11px] text-subtext" aria-hidden>{item.count}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{`${item.count} ${item.label}`}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

const FILTER_BUTTON = "relative z-10 cursor-pointer transition-all hover:brightness-125 focus-visible:outline-2 focus-visible:outline-ring";

/**
 * A filter affordance on the card: a real <button> when the page can filter,
 * otherwise the plain content. Sits above the card's stretched link (z-10) so
 * it is never nested inside it.
 */
function FilterControl({ label, onClick, className, children }: { label: string; onClick?: () => void; className?: string; children: ReactNode }) {
  if (!onClick) return <span className={cn("inline-flex", className)}>{children}</span>;
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn("inline-flex", FILTER_BUTTON, className)}>
      {children}
    </button>
  );
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

/**
 * Registry item card. The item name is the card's link and stretches over the
 * whole card (::after overlay); the filter badges are sibling buttons layered
 * above it, so no control is ever nested inside the link.
 */
export function ItemCard({ item, browseType, onSourceClick, onScopeClick, onToolClick, onPluginTypeClick, onDateClick }: ItemCardProps) {
  const pluginBadge = item.pluginType ? PLUGIN_TYPE_BADGES[item.pluginType] : null;
  // The registry derives the owner from the repo (registry-ops identity), so a
  // fork credits its own owner rather than this one.
  const authorName = item.author?.name;

  return (
    <article
      className={cn(
        "relative flex h-full flex-col border border-overlay bg-surface p-3 transition-colors",
        "hover:border-overlay-hover hover:bg-active has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-ring"
      )}
      data-testid="item-card"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.sourceType && (
            <FilterControl label={`Filter by source: ${sourceLabels[item.sourceType]}`} onClick={onSourceClick && (() => onSourceClick(item.sourceType!))}>
              <SourceBadge source={item.sourceType} />
            </FilterControl>
          )}
          {item.pluginType && pluginBadge && (
            <FilterControl label={`Filter by plugin type: ${pluginBadge.text}`} onClick={onPluginTypeClick && (() => onPluginTypeClick(item.pluginType!))}>
              <Label text={pluginBadge.text} accentColor={pluginTypeToBadgeColor[item.pluginType]} icon={pluginBadge.icon} tooltip={{ description: pluginBadge.description(item) }} />
            </FilterControl>
          )}
          {item.sourceType === "toolr" && item.targetScope && (
            <FilterControl label={`Filter by scope: ${scopeLabels[item.targetScope]}`} onClick={onScopeClick && (() => onScopeClick(item.targetScope!))}>
              <ScopeBadge scope={item.targetScope} />
            </FilterControl>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="img" className="inline-flex" aria-label={typeLabels[item.type]}>
              <TypeIcon type={item.type} size={16} className="opacity-60" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{typeLabels[item.type]}</TooltipContent>
        </Tooltip>
      </div>

      <h3 className="mb-0.5 text-sm font-medium text-text">
        <Link
          to={`/${typeToPath[item.type]}/${item.slug}`}
          state={browseType && item.type !== browseType ? { from: browseType } : undefined}
          className="outline-none after:absolute after:inset-0 after:content-['']"
        >
          {item.name}
        </Link>
      </h3>
      {authorName && <p className="mb-3 text-[11px] text-text-dim">by {authorName}</p>}
      <p className="mb-5 flex-grow text-justify text-xs text-subtext line-clamp-3">{item.description}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {item.compatibility.map((tool) => (
            <Tooltip key={tool}>
              <TooltipTrigger asChild>
                <FilterControl label={`Filter by coding agent: ${agentLabels[tool]}`} onClick={onToolClick && (() => onToolClick(tool))}>
                  <CodingAgentIcon agent={tool} size={16} decorative={!!onToolClick} />
                </FilterControl>
              </TooltipTrigger>
              <TooltipContent side="top">{agentLabels[tool]}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        {(item.package || item.wrapper) && <PackageBadges counts={item.package ?? { [item.wrapper!]: 1 }} />}
        {item.updatedAt && (
          <FilterControl label="Sort by last update" onClick={onDateClick} className="items-center gap-1 text-[11px] text-text-dim">
            <Clock className="h-3 w-3" aria-hidden />
            <span>{formatRelativeTime(item.updatedAt)}</span>
          </FilterControl>
        )}
      </div>
    </article>
  );
}
