import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
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
  Type,
} from "lucide-react";

import { Button } from "../ui/Button";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/Tooltip";
import { cn } from "@/lib/utils";
import type { FileTreeNode } from "@/lib/types";

type PreviewMode = "syntax" | "plain";

export interface FileStructureSectionProps {
  files: FileTreeNode[];
  rootName: string;
  /** Initial height of the split view in pixels. */
  initialHeight?: number;
  /** Fetches file content by path relative to the item root. */
  onFetchContent: (relativePath: string) => Promise<string>;
  /** Custom renderer for syntax-highlighted previews. Enables the syntax/plain toggle. */
  renderPreview?: (content: string, filePath: string, language: string) => ReactNode;
}

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

function nodeHasFiles(node: FileTreeNode): boolean {
  if (node.type === "file") return true;
  return !!node.children?.some(nodeHasFiles);
}

function collectDirPaths(nodes: FileTreeNode[], rootName: string): Set<string> {
  const paths = new Set<string>([rootName]);
  function walk(children: FileTreeNode[], pathPrefix: string) {
    for (const node of children.filter(nodeHasFiles)) {
      if (node.type === "directory") {
        const path = `${pathPrefix}/${node.name}`;
        paths.add(path);
        if (node.children) walk(node.children, path);
      }
    }
  }
  walk(nodes, rootName);
  return paths;
}

function NodeChevron({ isDir, expanded }: { isDir: boolean; expanded: boolean }) {
  if (!isDir) return <span className="w-3 shrink-0" />;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return <Chevron className="size-3 shrink-0" />;
}

function NodeIcon({ isDir, expanded }: { isDir: boolean; expanded: boolean }) {
  const Icon = isDir ? (expanded ? FolderOpen : Folder) : FileCode;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

interface FileTreeNodeItemProps {
  node: FileTreeNode;
  path: string;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  expandedPaths: Set<string>;
  onTogglePath: (path: string) => void;
}

function FileTreeNodeItem({
  node,
  path,
  selectedPath,
  onSelectFile,
  expandedPaths,
  onTogglePath,
}: FileTreeNodeItemProps) {
  const isDir = node.type === "directory";
  const isSelected = !isDir && selectedPath === path;
  const expanded = isDir && expandedPaths.has(path);

  return (
    <li role="treeitem" aria-expanded={isDir ? expanded : undefined} aria-selected={isSelected}>
      <button
        onClick={isDir ? () => onTogglePath(path) : () => onSelectFile(path)}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 overflow-hidden px-1 py-0.5 text-sm whitespace-nowrap transition-colors",
          isSelected
            ? "bg-secondary text-primary"
            : "text-foreground hover:bg-secondary hover:text-primary"
        )}
      >
        <NodeChevron isDir={isDir} expanded={expanded} />
        <NodeIcon isDir={isDir} expanded={expanded} />
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && expanded && node.children && (
        <ul role="group" className="ml-4 space-y-0.5">
          {node.children.filter(nodeHasFiles).map((child) => (
            <FileTreeNodeItem
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              expandedPaths={expandedPaths}
              onTogglePath={onTogglePath}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FileStructureSection({
  files,
  rootName,
  initialHeight = 500,
  onFetchContent,
  renderPreview,
}: FileStructureSectionProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fetchedFilePath, setFetchedFilePath] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<PreviewMode>(renderPreview ? "syntax" : "plain");

  const allDirPaths = useMemo(() => collectDirPaths(files, rootName), [files, rootName]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set<string>());
  useEffect(() => {
    setExpandedPaths(new Set(allDirPaths));
  }, [allDirPaths]);
  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);
  const allCollapsed = expandedPaths.size === 0;

  const [height, setHeight] = useState(initialHeight);
  const resizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizing.current = true;
      startY.current = e.clientY;
      startHeight.current = height;

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizing.current) return;
        setHeight(Math.max(150, startHeight.current + (ev.clientY - startY.current)));
      };
      const onMouseUp = () => {
        resizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove, { passive: true });
      document.addEventListener("mouseup", onMouseUp, { passive: true });
    },
    [height]
  );

  const firstFilePath = useMemo(() => {
    const findFirst = (nodes: FileTreeNode[], prefix: string): string | null => {
      for (const node of nodes) {
        const path = `${prefix}/${node.name}`;
        if (node.type === "file") return path;
        if (node.children) {
          const found = findFirst(node.children, path);
          if (found) return found;
        }
      }
      return null;
    };
    return findFirst(files, rootName);
  }, [files, rootName]);

  const effectiveFilePath = selectedFilePath ?? firstFilePath;
  const fileIsLoading = effectiveFilePath != null && effectiveFilePath !== fetchedFilePath;

  useEffect(() => {
    if (!effectiveFilePath) return;

    const relativePath = effectiveFilePath.startsWith(`${rootName}/`)
      ? effectiveFilePath.slice(rootName.length + 1)
      : effectiveFilePath;

    let cancelled = false;

    onFetchContent(relativePath)
      .then((text) => {
        if (!cancelled) {
          setFileContent(text);
          setFetchedFilePath(effectiveFilePath);
          setFileError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFileError(err instanceof Error ? err.message : "Failed to load file");
          setFetchedFilePath(effectiveFilePath);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveFilePath, rootName, onFetchContent]);

  const handleSelectFile = useCallback((filePath: string) => {
    setSelectedFilePath(filePath);
    setFileContent(null);
    setFileError(null);
  }, []);

  if (files.length === 0) return null;

  const selectedFileName = effectiveFilePath?.split("/").pop() || "";

  function renderContent(content: string, filePath: string) {
    if (mode === "syntax" && renderPreview) {
      return renderPreview(content, filePath, getLanguageFromPath(filePath));
    }
    return (
      <pre className="p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        <code>{content}</code>
      </pre>
    );
  }

  const modeOptions: { value: PreviewMode; icon: ReactNode; description: string }[] = [
    { value: "syntax", icon: <Code2 className="size-3" />, description: "Syntax highlighting" },
    { value: "plain", icon: <Type className="size-3" />, description: "Plain text" },
  ];

  return (
    <div data-term>
      <h3 className="prompt mb-2">file structure</h3>
      <div data-term-out className="flex gap-3" style={{ height: `${height}px` }}>
        {/* Tree panel */}
        <div
          className={cn(
            "flex flex-col overflow-hidden border border-border bg-card",
            effectiveFilePath ? "w-1/3 shrink-0" : "flex-1"
          )}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <FolderTree className="size-3.5 shrink-0 text-primary" />
            <span className="flex-1 truncate text-sm text-foreground">Files</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={allCollapsed ? "Expand all" : "Collapse all"}
                  onClick={() =>
                    setExpandedPaths(allCollapsed ? new Set(allDirPaths) : new Set())
                  }
                >
                  {allCollapsed ? (
                    <ChevronsUpDown className="size-3.5" />
                  ) : (
                    <ChevronsDownUp className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{allCollapsed ? "Expand all" : "Collapse all"}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <ul role="tree" className="space-y-0.5">
              <FileTreeNodeItem
                node={{ name: rootName, type: "directory", children: files }}
                path={rootName}
                selectedPath={effectiveFilePath}
                onSelectFile={handleSelectFile}
                expandedPaths={expandedPaths}
                onTogglePath={togglePath}
              />
            </ul>
          </div>
        </div>

        {/* Preview panel */}
        {effectiveFilePath && (
          <div className="flex flex-1 flex-col overflow-hidden border border-border bg-card">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
              <FileCode className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {selectedFileName}
              </span>
              {renderPreview && (
                <div className="flex items-center border border-border">
                  {modeOptions.map((option) => (
                    <Tooltip key={option.value}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={option.description}
                          className={cn(
                            "size-5",
                            mode === option.value && "bg-secondary text-primary"
                          )}
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
            <div className="flex-1 overflow-auto">
              {fileIsLoading ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading...
                </div>
              ) : fileError ? (
                <p className="flex items-center gap-2 p-3 text-sm text-destructive">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {fileError}
                </p>
              ) : fileContent !== null ? (
                renderContent(fileContent, effectiveFilePath)
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="group -mt-1.5 flex h-4 cursor-grab items-center justify-center active:cursor-grabbing"
      >
        <div className="h-1 w-10 bg-border transition-colors group-hover:bg-primary" />
      </div>
    </div>
  );
}
