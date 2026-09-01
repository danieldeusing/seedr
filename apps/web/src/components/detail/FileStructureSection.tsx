import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, type KeyboardEvent, type ReactNode } from "react";
import {
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
  Type,
} from "lucide-react";

import { Button } from "../ui/Button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/Tooltip";
import { PreviewErrorBoundary } from "./PreviewErrorBoundary";
import type { PreviewMode } from "./FilePreview";
import { cn } from "@/lib/utils";
import type { FileTreeNode } from "@/lib/types";
import type { PreviewResult } from "@/lib/preview";

// The preview renderers (tokenizer, image/binary panels) only load once a file is
// clicked: the detail page itself stays free of that chunk.
const FilePreview = lazy(() => import("./FilePreview").then((m) => ({ default: m.FilePreview })));

export interface FileStructureSectionProps {
  files: FileTreeNode[];
  rootName: string;
  /** Initial height of the split view in pixels (desktop layout). */
  initialHeight?: number;
  /** Fetches and classifies a file by path relative to the item root. */
  loadFile: (relativePath: string) => Promise<PreviewResult>;
  /** Host the files are fetched from; named in the UI before the first request is made. */
  sourceHost: string;
  /** Page for a file on its host (shown for binaries), or null when there is none. */
  fileUrl: (relativePath: string) => string | null;
}

function nodeHasFiles(node: FileTreeNode): boolean {
  if (node.type === "file") return true;
  return !!node.children?.some(nodeHasFiles);
}

interface VisibleItem {
  path: string;
  parentPath: string | null;
  isDir: boolean;
  expanded: boolean;
}

/** Depth-first list of the items a user can currently see (collapsed subtrees excluded). */
function listVisibleItems(root: FileTreeNode, rootPath: string, expandedPaths: Set<string>): VisibleItem[] {
  const items: VisibleItem[] = [];
  const walk = (node: FileTreeNode, path: string, parentPath: string | null) => {
    const isDir = node.type === "directory";
    const expanded = isDir && expandedPaths.has(path);
    items.push({ path, parentPath, isDir, expanded });
    if (expanded && node.children) {
      for (const child of node.children.filter(nodeHasFiles)) walk(child, `${path}/${child.name}`, path);
    }
  };
  walk(root, rootPath, null);
  return items;
}

function collectDirPaths(root: FileTreeNode, rootPath: string): Set<string> {
  const paths = new Set<string>();
  const walk = (node: FileTreeNode, path: string) => {
    if (node.type !== "directory") return;
    paths.add(path);
    for (const child of node.children?.filter(nodeHasFiles) ?? []) walk(child, `${path}/${child.name}`);
  };
  walk(root, rootPath);
  return paths;
}

function NodeChevron({ isDir, expanded }: { isDir: boolean; expanded: boolean }) {
  if (!isDir) return <span className="w-3 shrink-0" aria-hidden />;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return <Chevron className="size-3 shrink-0" aria-hidden />;
}

function NodeIcon({ isDir, expanded }: { isDir: boolean; expanded: boolean }) {
  const Icon = isDir ? (expanded ? FolderOpen : Folder) : FileCode;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

interface FileTreeNodeItemProps {
  node: FileTreeNode;
  path: string;
  level: number;
  selectedPath: string | null;
  focusedPath: string;
  expandedPaths: Set<string>;
  onActivate: (path: string, isDir: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>, path: string) => void;
}

function FileTreeNodeItem({ node, path, level, selectedPath, focusedPath, expandedPaths, onActivate, onKeyDown }: FileTreeNodeItemProps) {
  const isDir = node.type === "directory";
  const isSelected = !isDir && selectedPath === path;
  const expanded = isDir && expandedPaths.has(path);

  return (
    <li
      role="treeitem"
      aria-level={level}
      aria-expanded={isDir ? expanded : undefined}
      aria-selected={isDir ? undefined : isSelected}
      tabIndex={focusedPath === path ? 0 : -1}
      data-tree-path={path}
      className="outline-none"
      onKeyDown={(event) => onKeyDown(event, path)}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
          onActivate(path, isDir);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 px-1 py-0.5 text-sm whitespace-nowrap transition-colors",
          "[li:focus-visible>&]:outline-2 [li:focus-visible>&]:outline-ring [li:focus-visible>&]:-outline-offset-2",
          isSelected ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary hover:text-primary"
        )}
      >
        <NodeChevron isDir={isDir} expanded={expanded} />
        <NodeIcon isDir={isDir} expanded={expanded} />
        <span className="truncate">{node.name}</span>
      </div>
      {isDir && expanded && node.children && (
        <ul role="group" className="ml-4 space-y-0.5">
          {node.children.filter(nodeHasFiles).map((child) => (
            <FileTreeNodeItem
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              level={level + 1}
              selectedPath={selectedPath}
              focusedPath={focusedPath}
              expandedPaths={expandedPaths}
              onActivate={onActivate}
              onKeyDown={onKeyDown}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const MIN_HEIGHT = 150;
const MAX_HEIGHT = 1200;
const KEYBOARD_RESIZE_STEP = 24;

function clampHeight(value: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));
}

function useSplitHeight(initialHeight: number) {
  const [height, setHeight] = useState(() => clampHeight(initialHeight));

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = height;
      const onMove = (move: PointerEvent) => setHeight(clampHeight(startHeight + (move.clientY - startY)));
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerup", onUp, { passive: true });
    },
    [height]
  );

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const delta: Record<string, number> = {
      ArrowUp: -KEYBOARD_RESIZE_STEP,
      ArrowDown: KEYBOARD_RESIZE_STEP,
      PageUp: -KEYBOARD_RESIZE_STEP * 4,
      PageDown: KEYBOARD_RESIZE_STEP * 4,
    };
    if (event.key === "Home") setHeight(MIN_HEIGHT);
    else if (event.key === "End") setHeight(MAX_HEIGHT);
    else if (event.key in delta) setHeight((current) => clampHeight(current + delta[event.key]!));
    else return;
    event.preventDefault();
  }, []);

  return { height, startDrag, onKeyDown };
}

/** Selection + fetch state of the preview panel; fetches only after an explicit selection. */
function useSelectedFile(loadFile: FileStructureSectionProps["loadFile"], relativePathOf: (path: string) => string) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    loadFile(relativePathOf(selectedPath))
      .then((loaded) => {
        if (cancelled) return;
        setResult(loaded);
        setLoadedPath(selectedPath);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResult({ kind: "error", message: error instanceof Error ? error.message : "Failed to load file" });
        setLoadedPath(selectedPath);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath, loadFile, relativePathOf]);

  const select = useCallback(
    (path: string) => {
      if (path === selectedPath) return;
      setSelectedPath(path);
      setResult(null);
    },
    [selectedPath]
  );

  return { selectedPath, select, result, isLoading: selectedPath !== null && selectedPath !== loadedPath };
}

export function FileStructureSection({ files, rootName, initialHeight = 500, loadFile, sourceHost, fileUrl }: FileStructureSectionProps) {
  const root = useMemo<FileTreeNode>(() => ({ name: rootName, type: "directory", children: files }), [files, rootName]);
  const allDirPaths = useMemo(() => collectDirPaths(root, rootName), [root, rootName]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(allDirPaths));
  useEffect(() => {
    setExpandedPaths(new Set(allDirPaths));
  }, [allDirPaths]);
  const allCollapsed = expandedPaths.size === 0;

  const relativePathOf = useCallback(
    (path: string) => (path.startsWith(`${rootName}/`) ? path.slice(rootName.length + 1) : path),
    [rootName]
  );
  const { selectedPath, select, result, isLoading } = useSelectedFile(loadFile, relativePathOf);
  const [mode, setMode] = useState<PreviewMode>("syntax");
  const [focusedPath, setFocusedPath] = useState(rootName);
  const pendingFocus = useRef<string | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);
  const { height, startDrag, onKeyDown: onResizeKeyDown } = useSplitHeight(initialHeight);

  const visibleItems = useMemo(() => listVisibleItems(root, rootName, expandedPaths), [root, rootName, expandedPaths]);
  useEffect(() => {
    if (!visibleItems.some((item) => item.path === focusedPath)) setFocusedPath(rootName);
  }, [visibleItems, focusedPath, rootName]);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    treeRef.current?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(pendingFocus.current)}"]`)?.focus();
    pendingFocus.current = null;
  });

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const activate = useCallback(
    (path: string, isDir: boolean) => {
      setFocusedPath(path);
      if (isDir) togglePath(path);
      else select(path);
    },
    [select, togglePath]
  );

  const moveFocus = useCallback((path: string) => {
    pendingFocus.current = path;
    setFocusedPath(path);
  }, []);

  const onTreeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLLIElement>, path: string) => {
      const index = visibleItems.findIndex((item) => item.path === path);
      const item = visibleItems[index];
      if (!item) return;
      const go = (target: VisibleItem | undefined) => {
        if (target) moveFocus(target.path);
      };
      switch (event.key) {
        case "ArrowDown":
          go(visibleItems[index + 1]);
          break;
        case "ArrowUp":
          go(visibleItems[index - 1]);
          break;
        case "ArrowRight":
          if (item.isDir && !item.expanded) togglePath(path);
          else if (item.isDir) go(visibleItems[index + 1]);
          break;
        case "ArrowLeft":
          if (item.isDir && item.expanded) togglePath(path);
          else if (item.parentPath) moveFocus(item.parentPath);
          break;
        case "Home":
          go(visibleItems[0]);
          break;
        case "End":
          go(visibleItems[visibleItems.length - 1]);
          break;
        case "Enter":
        case " ":
          activate(path, item.isDir);
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [visibleItems, moveFocus, togglePath, activate]
  );

  if (files.length === 0) return null;

  const selectedName = selectedPath?.split("/").pop() ?? "";
  const showModeToggle = result?.kind === "text" && !isLoading;

  const modeOptions: { value: PreviewMode; icon: ReactNode; description: string }[] = [
    { value: "syntax", icon: <Code2 className="size-3" />, description: "Syntax highlighting" },
    { value: "plain", icon: <Type className="size-3" />, description: "Plain text" },
  ];

  let panelBody: ReactNode;
  if (!selectedPath) {
    panelBody = (
      <p className="p-3 text-sm text-muted-foreground" data-testid="preview-hint">
        Select a file to preview it. Files are fetched from <span className="text-foreground">{sourceHost}</span> only
        when you select them.
      </p>
    );
  } else if (isLoading || !result) {
    panelBody = (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Loading {selectedName} from {sourceHost}…
      </div>
    );
  } else {
    panelBody = (
      <PreviewErrorBoundary resetKey={selectedPath}>
        <Suspense fallback={<div className="h-full bg-card" />}>
          <FilePreview result={result} name={selectedName} mode={mode} openUrl={fileUrl(relativePathOf(selectedPath))} />
        </Suspense>
      </PreviewErrorBoundary>
    );
  }

  return (
    <div data-term>
      <h3 className="prompt mb-2">tree {rootName}/</h3>
      <div data-term-out>
        {/* Stacked on phones; side by side with a draggable height from md up. */}
        <div
          className="flex flex-col gap-3 md:h-(--split-height) md:flex-row"
          style={{ "--split-height": `${height}px` } as React.CSSProperties}
        >
          {/* Tree panel */}
          <div className="flex max-h-64 flex-col overflow-hidden border border-border bg-card md:max-h-none md:w-1/3 md:shrink-0">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
              <FolderTree className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="flex-1 truncate text-sm text-foreground">Files</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={allCollapsed ? "Expand all folders" : "Collapse all folders"}
                    onClick={() => setExpandedPaths(allCollapsed ? new Set(allDirPaths) : new Set())}
                  >
                    {allCollapsed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{allCollapsed ? "Expand all folders" : "Collapse all folders"}</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <ul ref={treeRef} role="tree" aria-label={`Files of ${rootName}`} className="space-y-0.5">
                <FileTreeNodeItem
                  node={root}
                  path={rootName}
                  level={1}
                  selectedPath={selectedPath}
                  focusedPath={focusedPath}
                  expandedPaths={expandedPaths}
                  onActivate={activate}
                  onKeyDown={onTreeKeyDown}
                />
              </ul>
            </div>
          </div>

          {/* Preview panel */}
          <div
            className="flex h-96 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-card md:h-auto"
            data-testid="preview-panel"
          >
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
              <FileCode className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{selectedName || "Preview"}</span>
              {showModeToggle && (
                <div className="flex items-center border border-border" role="group" aria-label="Preview mode">
                  {modeOptions.map((option) => (
                    <Tooltip key={option.value}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={option.description}
                          aria-pressed={mode === option.value}
                          className={cn("size-5", mode === option.value && "bg-secondary text-primary")}
                          onClick={() => setMode(option.value)}
                        >
                          {option.icon}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{option.description}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto">{panelBody}</div>
          </div>
        </div>

        {/* Resize handle (desktop): drag, or focus it and use the arrow keys. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize file preview"
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={MAX_HEIGHT}
          aria-valuenow={height}
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={onResizeKeyDown}
          className="group -mt-1.5 hidden h-4 cursor-row-resize touch-none items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-ring md:flex"
        >
          <div className="h-1 w-10 bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
        </div>
      </div>
    </div>
  );
}
