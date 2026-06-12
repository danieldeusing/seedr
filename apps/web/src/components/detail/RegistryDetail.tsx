import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { ChevronsDownUp, ChevronsUpDown, type LucideIcon } from "lucide-react";

import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/Tooltip";
import { CompatibilityBadges } from "../CompatibilityBadges";
import { cn } from "@/lib/utils";
import type { CodingAgent } from "@/lib/types";

export interface DetailLabelData {
  text: string;
  icon?: ReactNode;
  /** Accent classes, e.g. border/text color overrides. */
  className?: string;
  tooltip: { title?: string; description: string };
}

function DetailLabel({ label }: { label: DetailLabelData }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("cursor-help gap-1 font-medium", label.className)}>
          {label.icon}
          {label.text}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {label.tooltip.title && <p className="font-semibold">{label.tooltip.title}</p>}
        <p>{label.tooltip.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const MARKDOWN_CLASSES =
  "text-md text-muted-foreground leading-relaxed [&_strong]:text-foreground " +
  "[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:bg-secondary [&_code]:border [&_code]:border-border [&_code]:text-foreground [&_code]:font-mono [&_code]:text-sm " +
  "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-foreground [&_h1]:mb-2 " +
  "[&_h2]:text-md [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mb-2 " +
  "[&_h3]:text-md [&_h3]:font-medium [&_h3]:text-foreground [&_h3]:mb-1 " +
  "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_p]:mb-2 " +
  "[&_pre]:bg-secondary [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:text-sm";

const COLLAPSED_MAX_HEIGHT = 240;

function CollapsibleTextSection({ children, header }: { children: ReactNode; header: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > COLLAPSED_MAX_HEIGHT + 8);
  }, []);

  useEffect(() => {
    measure();
  }, [children, measure]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const showCollapsed = overflows && !expanded;

  return (
    <div data-term>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="prompt">{header}</h3>
        {overflows && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={expanded ? "Show less content" : "Show full content"}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronsDownUp className="size-3.5" />
                ) : (
                  <ChevronsUpDown className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{expanded ? "Show less content" : "Show full content"}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div data-term-out className="relative">
        <div
          ref={contentRef}
          className={MARKDOWN_CLASSES}
          style={showCollapsed ? { maxHeight: COLLAPSED_MAX_HEIGHT, overflow: "hidden" } : undefined}
        >
          <div>{children}</div>
        </div>

        {showCollapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
    </div>
  );
}

const INTEGRATION_PARAGRAPHS = [
  "This plugin contains no source files — only a README with setup instructions for an external tool you need to install on your machine (e.g. via brew or npm).",
  "Why install it then? Installing the plugin adds it to enabledPlugins in your settings. That entry is the signal the AI tool needs — without it, the AI tool has no idea the external tool exists, even if it's already on your machine. With it enabled, the AI tool will automatically find and use the external tool for code intelligence (go-to-definition, type checking, etc.).",
  "In short: the README tells you what to install locally, and the plugin setting tells the AI tool to use it.",
];

export interface RegistryDetailProps {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  labels?: DetailLabelData[];
  subtitle?: ReactNode;
  description?: string;
  longDescription?: ReactNode;
  integration?: boolean;
  compatibleTools?: CodingAgent[];
  maxWidth?: string;
  children?: ReactNode;
}

export function RegistryDetail({
  icon: Icon,
  iconColor,
  title,
  labels,
  subtitle,
  description,
  longDescription,
  integration,
  compatibleTools,
  maxWidth = "max-w-6xl",
  children,
}: RegistryDetailProps) {
  return (
    <div className={`${maxWidth} mx-auto space-y-8 px-4 py-6`}>
      {/* Header row */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <Icon className={`size-6 shrink-0 ${iconColor}`} />
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {labels?.map((label) => <DetailLabel key={label.text} label={label} />)}
        </div>
        {subtitle && <div className="mt-1">{subtitle}</div>}
      </div>

      {/* Description */}
      {description && (
        <div data-term>
          <h3 className="prompt mb-2">cat description.md</h3>
          <p data-term-out className="text-md leading-relaxed text-muted-foreground">{description}</p>
        </div>
      )}

      {/* Long description (TL;DR) */}
      {longDescription && (
        <CollapsibleTextSection header={'cat "tl;dr.md"'}>{longDescription}</CollapsibleTextSection>
      )}

      {/* Integration explanation */}
      {integration && (
        <CollapsibleTextSection header="man integrations">
          {INTEGRATION_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph.slice(0, 16)}>{paragraph}</p>
          ))}
        </CollapsibleTextSection>
      )}

      {/* Compatible with */}
      {compatibleTools && compatibleTools.length > 0 && (
        <div data-term>
          <h3 className="prompt mb-3">jq .compatibility item.json</h3>
          <div data-term-out>
            <CompatibilityBadges tools={compatibleTools} size="md" />
          </div>
        </div>
      )}

      {/* Custom content */}
      {children}
    </div>
  );
}
