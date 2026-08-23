import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ComponentType } from "@seedr/shared";
import { AuthorForm } from "./features/author/AuthorForm";
import { Detail } from "./features/explorer/Detail";
import { Explorer } from "./features/explorer/Explorer";
import { selectedItem, useStudio } from "./features/explorer/store";
import type { StudioItem } from "./features/explorer/registry";
import { GitPanel } from "./features/git/GitPanel";
import { Onboarding } from "./features/onboarding/Onboarding";
import { TestPanel } from "./features/test/TestPanel";
import { UpdateForm } from "./features/update/UpdateForm";

type Pane = "detail" | "author" | "git" | "update" | "test";

interface WorkspaceProps {
  pane: Pane;
  current: StudioItem | null;
  onAdded(type: ComponentType, slug: string): void;
  setPane(pane: Pane): void;
}

/** The main area: a repo-wide pane, or the selected item in one of its views. */
function Workspace({ pane, current, onAdded, setPane }: WorkspaceProps): ReactNode {
  if (pane === "author") return <AuthorForm onAdded={onAdded} />;
  if (pane === "git") return <GitPanel />;
  if (!current) return <p className="p-6 text-xs text-muted-foreground">Select an item, or add a capability.</p>;
  const key = `${current.type}/${current.slug}`;
  if (pane === "update") return <UpdateForm key={key} item={current} onDone={() => setPane("detail")} />;
  if (pane === "test") return <TestPanel key={key} item={current} onDone={() => setPane("detail")} />;
  return <Detail key={key} item={current} onEdit={() => setPane("update")} onTest={() => setPane("test")} />;
}

export function App() {
  const [pane, setPane] = useState<Pane>("detail");
  const repo = useStudio((s) => s.repo);
  const items = useStudio((s) => s.items);
  const problems = useStudio((s) => s.problems);
  const loading = useStudio((s) => s.loading);
  const error = useStudio((s) => s.error);
  const selected = useStudio((s) => s.selected);
  const current = useStudio(selectedItem);
  const init = useStudio((s) => s.init);
  const chooseRepo = useStudio((s) => s.chooseRepo);
  const select = useStudio((s) => s.select);

  useEffect(() => {
    void init();
  }, [init]);

  // After a successful add the watcher refreshes the list; select the new item
  // and return to its detail view.
  const onAdded = useCallback(
    (type: ComponentType, slug: string) => {
      select({ type, slug });
      setPane("detail");
    },
    [select]
  );

  if (!repo) return <Onboarding error={error} onChoose={() => void chooseRepo()} />;

  return (
    <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center gap-4 border-b border-border bg-card px-4 py-2 text-xs">
        <span className="font-bold text-primary">seedr studio</span>
        <span className="truncate text-muted-foreground" title={repo.root}>
          {repo.name} · {items.length} items{loading ? " · refreshing…" : ""}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => setPane("author")} className="link-quiet" aria-pressed={pane === "author"}>
          add capability
        </button>
        <button type="button" onClick={() => setPane("git")} className="link-quiet" aria-pressed={pane === "git"}>
          git status
        </button>
        <button type="button" onClick={() => void chooseRepo()} className="link-quiet">
          switch repo
        </button>
      </header>
      <div className="grid min-h-0 grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-hidden border-r border-border bg-card">
          {error && (
            <p className="m-4 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <Explorer
            items={items}
            problems={problems}
            selected={selected}
            onSelect={(selection) => {
              select(selection);
              setPane("detail");
            }}
          />
        </aside>
        <section className="min-h-0 overflow-hidden">
          <Workspace pane={pane} current={current} onAdded={onAdded} setPane={setPane} />
        </section>
      </div>
    </div>
  );
}
