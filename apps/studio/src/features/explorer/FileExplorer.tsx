import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FileTreeNode } from "@seedr/shared";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Code2,
  FileCode,
  Folder,
  FolderOpen,
  FolderTree,
  Loader2,
  ExternalLink,
  FileText,
  Type,
} from "lucide-react";
import { useAppTheme } from "@/core/useAppTheme";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator, type ContextMenuPosition } from "@/core/ContextMenu";
import { PaneResizeHandle } from "@/core/PaneResizeHandle";
import { useRememberedSize } from "@/core/remembered";
import { FormattedPreview } from "./FormattedPreview";

// Monaco is ~3 MB and only needed once a file preview opens; it stays out of the
// main bundle and loads on first use.
const MonacoPreview = lazy(() => import("./MonacoPreview").then((m) => ({ default: m.MonacoPreview })));

/** Language for Monaco from the file extension; ported from apps/web. */
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
    json: "json", md: "markdown", yml: "yaml", yaml: "yaml",
    sh: "shell", bash: "shell",
    rs: "rust", py: "python", rb: "ruby", go: "go",
    html: "html", css: "css", scss: "scss",
    toml: "ini", xml: "xml", sql: "sql",
  };
  return map[ext] || "plaintext";
}

type PreviewMode = "syntax" | "formatted" | "plain";

const isMarkdown = (path: string) => path.toLowerCase().endsWith(".md");

interface FileExplorerProps {
  files: FileTreeNode[];
  rootName: string;
  /** Fetches file content by path relative to the item root. Must be memoized. */
  onFetchContent: (relativePath: string) => Promise<string>;
  /** Opens the file with the OS default app (the path for anything Monaco cannot show). */
  onOpenFile: (relativePath: string) => void;
}

const nodeHasFiles = (node: FileTreeNode): boolean =>
  node.type === "file" || (node.children ?? []).some(nodeHasFiles);

function collectDirPaths(nodes: FileTreeNode[], prefix: string, into: string[]): void {
  for (const node of nodes) {
    if (node.type !== "directory") continue;
    const path = `${prefix}/${node.name}`;
    into.push(path);
    collectDirPaths(node.children ?? [], path, into);
  }
}

function firstFilePath(nodes: FileTreeNode[], prefix: string): string | null {
  for (const node of nodes) {
    if (node.type === "file") return `${prefix}/${node.name}`;
    const nested = firstFilePath(node.children ?? [], `${prefix}/${node.name}`);
    if (nested) return nested;
  }
  return null;
}

/**
 * The tree-plus-preview split from apps/web's FileStructureSection, adapted to
 * the desktop pane: it fills its container instead of carrying its own height
 * and resize handle, tooltips are the estate's `data-tip`, and content arrives
 * through the injected fetcher (Studio's scoped filesystem IPC).
 */
export function FileExplorer({ files, rootName, onFetchContent, onOpenFile }: FileExplorerProps) {
  const appTheme = useAppTheme();
  const visibleFiles = useMemo(() => files.filter(nodeHasFiles), [files]);
  const allDirPaths = useMemo(() => {
    const paths: string[] = [rootName];
    collectDirPaths(visibleFiles, rootName, paths);
    return paths;
  }, [visibleFiles, rootName]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [mode, setMode] = useState<PreviewMode>("syntax");
  const [menu, setMenu] = useState<{ position: ContextMenuPosition; relativePath: string } | null>(null);
  const [treeWidth, setTreeWidth] = useRememberedSize("studio-file-tree-width", 240);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fetchedFilePath, setFetchedFilePath] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    setExpandedPaths(new Set(allDirPaths));
    setSelectedFilePath(null);
  }, [allDirPaths]);

  const effectiveFilePath = selectedFilePath ?? firstFilePath(visibleFiles, rootName);
  const relativePath = effectiveFilePath?.startsWith(`${rootName}/`) ? effectiveFilePath.slice(rootName.length + 1) : effectiveFilePath;

  useEffect(() => {
    if (!relativePath || !effectiveFilePath) return;
    let cancelled = false;
    setFileError(null);
    onFetchContent(relativePath).then(
      (content) => {
        if (cancelled) return;
        setFileContent(content);
        setFetchedFilePath(effectiveFilePath);
      },
      (error: Error) => {
        if (cancelled) return;
        setFileError(error.message);
        setFetchedFilePath(effectiveFilePath);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [relativePath, effectiveFilePath, onFetchContent]);

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const fileIsLoading = effectiveFilePath !== null && fetchedFilePath !== effectiveFilePath;
  const selectedFileName = effectiveFilePath?.split("/").pop() ?? "";
  const allCollapsed = expandedPaths.size === 0;

  const modeOptions: { value: PreviewMode; icon: ReactNode; label: string; disabled?: boolean }[] = [
    { value: "syntax", icon: <Code2 className="size-3" />, label: "syntax highlighting" },
    { value: "formatted", icon: <FileText className="size-3" />, label: "formatted", disabled: !relativePath || !isMarkdown(relativePath) },
    { value: "plain", icon: <Type className="size-3" />, label: "plain text" },
  ];
  const effectiveMode: PreviewMode = mode === "formatted" && (!relativePath || !isMarkdown(relativePath)) ? "syntax" : mode;

  return (
    <div className="flex h-full min-h-0">
      <div style={{ width: treeWidth }} className="flex shrink-0 flex-col overflow-hidden border border-border bg-card">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <FolderTree className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1 truncate text-xs text-foreground">Files</span>
          <button
            type="button"
            aria-label={allCollapsed ? "expand all" : "collapse all"}
            onClick={() => setExpandedPaths(allCollapsed ? new Set(allDirPaths) : new Set())}
            className="text-muted-foreground hover:text-primary"
          >
            {allCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <ul role="tree" className="space-y-0.5">
            <TreeNode
              node={{ name: rootName, type: "directory", children: visibleFiles }}
              path={rootName}
              selectedPath={effectiveFilePath}
              onSelectFile={setSelectedFilePath}
              expandedPaths={expandedPaths}
              onTogglePath={togglePath}
              onFileContextMenu={(path, position) => {
                const rel = path.startsWith(`${rootName}/`) ? path.slice(rootName.length + 1) : path;
                setMenu({ position, relativePath: rel });
              }}
            />
          </ul>
        </div>
      </div>

      <PaneResizeHandle onResize={(delta) => setTreeWidth((width) => Math.max(180, Math.min(480, width + delta)))} label="resize file tree" />

      {effectiveFilePath && relativePath && (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border border-border bg-card">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <FileCode className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{selectedFileName}</span>
            <div className="flex items-center border border-neutral-600">
              {modeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={effectiveMode === option.value}
                  disabled={option.disabled}
                  data-tip={option.disabled ? `${option.label} — markdown files only` : option.label}
                  className={`flex size-5 cursor-pointer items-center justify-center transition-colors ${effectiveMode === option.value ? "bg-violet-500/20 text-violet-300" : "text-neutral-400 hover:bg-neutral-500/20 hover:text-neutral-300"} disabled:cursor-not-allowed disabled:opacity-40`}
                  onClick={() => setMode(option.value)}
                >
                  {option.icon}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <PreviewBody loading={fileIsLoading} error={fileError} content={fileContent} mode={effectiveMode} relativePath={relativePath} appTheme={appTheme} />
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu position={menu.position} onClose={() => setMenu(null)}>
          <ContextMenuItem
            onSelect={() => {
              setMenu(null);
              onOpenFile(menu.relativePath);
            }}
          >
            <ExternalLink className="size-3" aria-hidden="true" /> open with default app
          </ContextMenuItem>
          <ContextMenuSeparator />
          {modeOptions.map((option) => (
            <ContextMenuItem
              key={option.value}
              disabled={option.value === "formatted" && !isMarkdown(menu.relativePath)}
              onSelect={() => {
                setMode(option.value);
                setSelectedFilePath(`${rootName}/${menu.relativePath}`);
                setMenu(null);
              }}
            >
              {option.icon} view as {option.label}
            </ContextMenuItem>
          ))}
        </ContextMenu>
      )}
    </div>
  );
}

interface PreviewBodyProps {
  loading: boolean;
  error: string | null;
  content: string | null;
  mode: PreviewMode;
  relativePath: string;
  appTheme: string;
}

function PreviewBody({ loading, error, content, mode, relativePath, appTheme }: PreviewBodyProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        loading…
      </div>
    );
  }
  if (error) {
    return (
      <p className="flex items-center gap-2 p-3 text-xs text-destructive" role="alert">
        <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
        {error}
      </p>
    );
  }
  if (content === null) return null;
  if (mode === "syntax") {
    return (
      <Suspense fallback={<p className="p-3 text-xs text-muted-foreground">loading editor…</p>}>
        <MonacoPreview content={content} language={getLanguageFromPath(relativePath)} appTheme={appTheme} />
      </Suspense>
    );
  }
  if (mode === "formatted") return <FormattedPreview content={content} />;
  return (
    <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground" data-testid="file-content">
      <code>{content}</code>
    </pre>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  path: string;
  selectedPath: string | null;
  onSelectFile(path: string): void;
  expandedPaths: Set<string>;
  onTogglePath(path: string): void;
  onFileContextMenu(path: string, position: ContextMenuPosition): void;
}

function rowGlyphs(isDir: boolean, expanded: boolean): ReactNode {
  if (!isDir) {
    return (
      <>
        <span className="w-3 shrink-0" />
        <FileCode className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </>
    );
  }
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const FolderGlyph = expanded ? FolderOpen : Folder;
  return (
    <>
      <Chevron className="size-3 shrink-0" aria-hidden="true" />
      <FolderGlyph className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
}

function TreeNode({ node, path, selectedPath, onSelectFile, expandedPaths, onTogglePath, onFileContextMenu }: TreeNodeProps) {
  const isDir = node.type === "directory";
  const expanded = expandedPaths.has(path);
  const isSelected = !isDir && path === selectedPath;
  return (
    <li role="treeitem" aria-expanded={isDir ? expanded : undefined} aria-selected={isSelected}>
      <button
        type="button"
        onClick={isDir ? () => onTogglePath(path) : () => onSelectFile(path)}
        onContextMenu={
          isDir
            ? undefined
            : (event) => {
                event.preventDefault();
                onFileContextMenu(path, { x: event.clientX, y: event.clientY });
              }
        }
        className={`flex w-full items-center gap-1.5 overflow-hidden px-1 py-0.5 text-xs whitespace-nowrap ${isSelected ? "bg-secondary text-primary" : "text-foreground hover:bg-muted hover:text-primary"}`}
      >
        {rowGlyphs(isDir, expanded)}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && expanded && node.children && (
        <ul role="group" className="ml-4 space-y-0.5">
          {node.children.filter(nodeHasFiles).map((child) => (
            <TreeNode
              key={`${path}/${child.name}`}
              node={child}
              path={`${path}/${child.name}`}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              expandedPaths={expandedPaths}
              onTogglePath={onTogglePath}
              onFileContextMenu={onFileContextMenu}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
