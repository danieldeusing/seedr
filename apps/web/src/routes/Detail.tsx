import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { usePageMeta } from "@/hooks/usePageMeta";
import { NotFound } from "@/routes/NotFound";
import { itemMeta, notFoundMeta } from "../../scripts/site-meta.mjs";
// toolr-design-ignore-next-line
import { Clock, Folder, Lock, Package, Plug, Puzzle, Shield, User, type LucideIcon } from "lucide-react";
import { FileStructureSection } from "@/components/detail/FileStructureSection";
import { RegistryDetail, type DetailLabelData } from "@/components/detail/RegistryDetail";
import { CodeBlock } from "@/components/ui";
import { typeLabels, typeTextColors, sourceToBadgeColor, sourceLabels, scopeToBadgeColor, scopeLabels, pluginTypeToBadgeColor, pathToType } from "@/lib/colors";
import { typeIcons } from "@/components/TypeIcon";
import { AuthorLink } from "@/components/AuthorLink";
import { PluginContents } from "@/components/PluginContents";
import { getItem, getLongDescription, getFileTree } from "@/lib/registry";
import { useTerminalSession } from "@/lib/useTerminalSession";
import { loadPreview, type PreviewResult } from "@/lib/preview";
import { resolveFileSource } from "@/lib/fileSource";
import type { ComponentType, FileTreeNode, ScopeType, SourceType } from "@/lib/types";

// The markdown toolchain is only needed for the tl;dr on this page.
const MarkdownText = lazy(() => import("@/components/detail/MarkdownText").then((m) => ({ default: m.MarkdownText })));

const sourceDescriptions: Record<SourceType, string> = {
  official: "Published by the tool maker",
  toolr: "Published by Toolr Suite",
  community: "Community contribution",
};

const scopeIcons: Record<ScopeType, LucideIcon> = {
  user: User,
  project: Folder,
  local: Lock,
};

// Accent classes for the detail header badges, keyed by BadgeColor names from lib/colors
const badgeColorClasses: Record<string, string> = {
  amber: "border-(--badge-amber)/60 text-(--badge-amber)",
  blue: "border-(--badge-blue)/60 text-(--badge-blue)",
  violet: "border-(--badge-violet)/60 text-(--badge-violet)",
  teal: "border-(--badge-teal)/60 text-(--badge-teal)",
  neutral: "text-muted-foreground",
  red: "border-(--badge-red)/60 text-(--badge-red)",
  emerald: "border-(--badge-emerald)/60 text-(--badge-emerald)",
  pink: "border-(--badge-pink)/60 text-(--badge-pink)",
  orange: "border-(--badge-orange)/60 text-(--badge-orange)",
};

const scopeDescriptions: Record<ScopeType, string> = {
  user: "Built for user-level installation. May not work correctly in other scopes.",
  project: "Built for project-level installation. May not work correctly in other scopes.",
  local: "Built for local settings (gitignored). May not work correctly in other scopes.",
};

function buildDetailLabels(item: NonNullable<ReturnType<typeof getItem>>): DetailLabelData[] {
  const labels: DetailLabelData[] = [];
  if (item.sourceType) {
    labels.push({
      text: sourceLabels[item.sourceType],
      className: badgeColorClasses[sourceToBadgeColor[item.sourceType]],
      icon: <Shield className="size-3" />,
      tooltip: { title: sourceLabels[item.sourceType], description: sourceDescriptions[item.sourceType] },
    });
  }
  if (item.pluginType === "package") {
    labels.push({
      text: "Package",
      className: badgeColorClasses[pluginTypeToBadgeColor.package],
      icon: <Package className="size-3" />,
      tooltip: { description: "Bundles multiple capabilities (skills, hooks, agents, etc.) into a single plugin" },
    });
  }
  if (item.pluginType === "wrapper") {
    labels.push({
      text: "Wrapper",
      className: badgeColorClasses[pluginTypeToBadgeColor.wrapper],
      icon: <Puzzle className="size-3" />,
      tooltip: { description: `Wraps a single ${item.wrapper} capability as a plugin` },
    });
  }
  if (item.pluginType === "integration") {
    labels.push({
      text: "Integration",
      className: badgeColorClasses[pluginTypeToBadgeColor.integration],
      icon: <Plug className="size-3" />,
      tooltip: { description: "Integrates an external tool with your AI assistant. Installing adds it to enabledPlugins — the README explains how to set up the tool itself." },
    });
  }
  if (item.sourceType === "toolr" && item.targetScope) {
    const ScopeIcon = scopeIcons[item.targetScope];
    labels.push({
      text: scopeLabels[item.targetScope],
      className: badgeColorClasses[scopeToBadgeColor[item.targetScope]],
      icon: <ScopeIcon className="size-3" />,
      tooltip: { title: `${scopeLabels[item.targetScope]} Scope`, description: scopeDescriptions[item.targetScope] },
    });
  }
  return labels;
}

export function Detail() {
  const { type, slug } = useParams<{ type: string; slug: string }>();
  const componentType = (type ? pathToType(type) : undefined) as ComponentType;
  useScrollRestoration();

  const item = slug ? getItem(slug, componentType) : undefined;
  usePageMeta(item ? itemMeta(item) : notFoundMeta());

  const [longDescription, setLongDescription] = useState<string>();
  const [fileTree, setFileTree] = useState<FileTreeNode[]>();
  const [lazyDataSettled, setLazyDataSettled] = useState(false);
  useEffect(() => {
    if (!slug) return;
    // Reset and guard against out-of-order resolution: when navigating quickly
    // between items, an older fetch must not overwrite the newer item's data.
    let cancelled = false;
    setLazyDataSettled(false);
    setLongDescription(undefined);
    setFileTree(undefined);
    Promise.allSettled([
      getLongDescription(slug, componentType).then(d => { if (!cancelled) setLongDescription(d); }),
      getFileTree(slug, componentType).then(t => { if (!cancelled) setFileTree(t); }),
    ]).then(() => { if (!cancelled) setLazyDataSettled(true); });
    return () => { cancelled = true; };
  }, [slug, componentType]);

  // Start the terminal session only once the lazy sections (tl;dr, file tree)
  // have settled, so the whole page animates in one uninterrupted sequence.
  useTerminalSession(item && lazyDataSettled ? `${item.type}/${item.slug}` : null);

  // Where this item's files live. Nothing is requested from that host until the
  // visitor selects a file in the tree (see FileStructureSection).
  const externalUrl = item?.externalUrl;
  const fileSource = useMemo(() => resolveFileSource(externalUrl, import.meta.env.DEV), [externalUrl]);
  const loadFile = useCallback(
    async (relativePath: string): Promise<PreviewResult> => {
      const rawUrl = fileSource?.rawUrl(relativePath);
      if (!rawUrl) return { kind: "error", message: "This item has no file source" };
      return loadPreview(relativePath, rawUrl);
    },
    [fileSource]
  );

  if (!item) return <NotFound message="Item not found" />;

  const installCommand = `npx @danieldeusing/seedr add ${item.slug} --type ${item.type}`;

  const labels = buildDetailLabels(item);

  const subtitle = (item.author || item.sourceType === "toolr") ? (
    <div className="flex items-center gap-2 text-sm text-subtext">
      <AuthorLink
        author={item.sourceType === "toolr" ? { name: "Daniel Deusing" } : item.author!}
      />
      {item.updatedAt && (
        <>
          <span className="text-text-dim">·</span>
          <span className="flex items-center gap-1 text-text-dim">
            <Clock className="w-3 h-3" />
            {new Date(item.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </span>
        </>
      )}
    </div>
  ) : null;

  return (
    <RegistryDetail
      // Remount per item so the terminal-typing animation never restores a
      // previous item's prompt text into React-reused DOM nodes.
      key={`${item.type}/${item.slug}`}
      icon={typeIcons[item.type]}
      iconColor={typeTextColors[item.type]}
      title={item.name}
      labels={labels}
      subtitle={subtitle}
      description={item.description}
      longDescription={
        longDescription ? (
          <Suspense fallback={<p className="text-md text-muted-foreground">{longDescription}</p>}>
            <MarkdownText>{longDescription}</MarkdownText>
          </Suspense>
        ) : undefined
      }
      integration={item.pluginType === "integration"}
      compatibleTools={item.compatibility}
      maxWidth="max-w-6xl"
    >
      {/* Install command */}
      <div data-term>
        <h3 className="prompt mb-3">cat install.sh</h3>
        <div data-term-out>
          <CodeBlock code={installCommand} />
        </div>
      </div>

      {/* Plugin type explanation */}
      {item.pluginType === "wrapper" && item.wrapper && (
        <div data-term>
          <h3 className="prompt mb-3">jq .wrapper plugin.json</h3>
          <p data-term-out className="text-md text-muted-foreground leading-relaxed mb-1">
            This plugin wraps a single capability as an installable plugin.
            Functionally equivalent to installing the {typeLabels[item.wrapper as keyof typeof typeLabels]?.toLowerCase() || item.wrapper} directly, but delivered and managed as a plugin package.
          </p>
          <div data-term-out>
            <PluginContents counts={{ [item.wrapper]: 1 }} />
          </div>
        </div>
      )}

      {item.pluginType === "package" && item.package && Object.keys(item.package).length > 0 && (
        <div data-term>
          <h3 className="prompt mb-3">jq .package plugin.json</h3>
          <p data-term-out className="text-md text-muted-foreground leading-relaxed mb-1">
            This plugin bundles multiple capabilities into a single installable package.
          </p>
          <div data-term-out>
            <PluginContents counts={item.package} />
          </div>
        </div>
      )}

      {/* File tree (lazy-loaded from item.json); previews load on click only */}
      {fileTree && fileSource && (
        <FileStructureSection
          files={fileTree}
          rootName={item.slug}
          initialHeight={500}
          loadFile={loadFile}
          sourceHost={fileSource.host}
          fileUrl={fileSource.pageUrl}
        />
      )}

      {/* CLI Reference */}
      <div data-term>
        <h3 className="prompt mb-3">seedr add --help</h3>
        {/* scrolls inside its own box on narrow screens instead of widening the page */}
        <div data-term-out className="overflow-x-auto border border-overlay bg-surface" data-testid="cli-table">
          <table className="w-full min-w-[560px] table-fixed text-sm">
            <colgroup>
              <col className="w-[200px]" />
              <col />
              <col className="w-[148px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-overlay bg-active">
                <th className="text-left px-4 py-2 text-text font-medium">Option</th>
                <th className="text-left px-4 py-2 text-text font-medium">Description</th>
                <th className="text-left px-4 py-2 text-text font-medium">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-overlay">
              <tr>
                <td className="px-4 py-2 font-mono text-xs text-text whitespace-nowrap">-t, --type &lt;type&gt;</td>
                <td className="px-4 py-2 text-subtext">Content type: <code className="text-primary">skill</code>, <code className="text-primary">agent</code>, <code className="text-primary">hook</code>, <code className="text-primary">mcp</code>, <code className="text-primary">plugin</code>, <code className="text-primary">settings</code><br /><span className="text-text-dim text-xs">I recommend always setting this, but it's only needed when the same slug exists in multiple types</span></td>
                <td className="px-4 py-2 text-text-dim text-xs">First match</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs text-text whitespace-nowrap">-a, --agents &lt;agents&gt;</td>
                <td className="px-4 py-2 text-subtext">Coding agents to install for: <code className="text-primary">claude</code>, <code className="text-primary">copilot</code>, <code className="text-primary">gemini</code>, <code className="text-primary">codex</code>, <code className="text-primary">opencode</code>, or <code className="text-primary">all</code></td>
                <td className="px-4 py-2 text-text-dim text-xs">Prompted</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs text-text whitespace-nowrap">-s, --scope &lt;scope&gt;</td>
                <td className="px-4 py-2 text-subtext">Installation scope: <code className="text-primary">project</code>, <code className="text-primary">user</code>, or <code className="text-primary">local</code> (gitignored)</td>
                <td className="px-4 py-2 text-text-dim text-xs">Prompted</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs text-text whitespace-nowrap">-m, --method &lt;method&gt;</td>
                <td className="px-4 py-2 text-subtext">Installation method: <code className="text-primary">symlink</code> or <code className="text-primary">copy</code></td>
                <td className="px-4 py-2 text-text-dim text-xs"><code className="text-primary">copy</code> (single agent)<br />prompted (multiple)</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs text-text whitespace-nowrap">-y, --yes</td>
                <td className="px-4 py-2 text-subtext">Skip confirmation prompts (non-interactive)</td>
                <td className="px-4 py-2 text-text-dim text-xs">Off</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs text-text whitespace-nowrap">-f, --force</td>
                <td className="px-4 py-2 text-subtext">Overwrite existing files</td>
                <td className="px-4 py-2 text-text-dim text-xs">Off</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs text-text whitespace-nowrap">-n, --dry-run</td>
                <td className="px-4 py-2 text-subtext">Show what would be installed without making changes</td>
                <td className="px-4 py-2 text-text-dim text-xs">Off</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Example commands */}
      <div data-term>
        <h3 className="prompt mb-3">history</h3>
        <div className="space-y-4">
          <div data-term-out>
            <CodeBlock
              label="Install for all compatible coding agents"
              code={`npx @danieldeusing/seedr add ${item.slug} --type ${item.type} --agents all --method symlink`}
            />
          </div>
          <div data-term-out>
            <CodeBlock
              label="Install for specific coding agent"
              code={`npx @danieldeusing/seedr add ${item.slug} --type ${item.type} --agents claude`}
            />
          </div>
          <div data-term-out>
            <CodeBlock
              label="Non-interactive (CI/scripts)"
              code={`npx @danieldeusing/seedr add ${item.slug} --type ${item.type} --agents all --scope project --method symlink --yes`}
            />
          </div>
        </div>
      </div>
    </RegistryDetail>
  );
}
