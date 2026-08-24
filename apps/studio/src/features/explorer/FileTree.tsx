import type { FileTreeNode } from "@seedr/shared";

interface FileTreeProps {
  nodes: FileTreeNode[];
  selected: string | null;
  onSelect(path: string): void;
  /** Path prefix of this subtree, relative to the item directory. */
  prefix?: string;
}

/** A plain nested list: directories as labels, files as buttons. */
export function FileTree({ nodes, selected, onSelect, prefix = "" }: FileTreeProps) {
  return (
    <ul className="mt-1 text-xs">
      {nodes.map((node) => {
        const path = `${prefix}${node.name}`;
        return (
          <li key={path} className="pl-3">
            {node.type === "directory" ? (
              <>
                <span className="text-primary">{node.name}/</span>
                <FileTree nodes={node.children ?? []} selected={selected} onSelect={onSelect} prefix={`${path}/`} />
              </>
            ) : (
              <button
                type="button"
                aria-current={selected === path ? "true" : undefined}
                onClick={() => onSelect(path)}
                className={`hover:text-primary ${selected === path ? "text-primary underline" : "text-muted-foreground"}`}
              >
                {node.name}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
