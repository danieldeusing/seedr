import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "@seedr/shared";
import { AppHeader } from "./core/AppHeader";
import { ExternalLinkDialog } from "./core/ExternalLinkDialog";
import { Modal } from "./core/Modal";
import { AuthorForm } from "./features/author/AuthorForm";
import { Detail } from "./features/explorer/Detail";
import { Explorer } from "./features/explorer/Explorer";
import { selectedItem, useStudio } from "./features/explorer/store";
import { GitPanel } from "./features/git/GitPanel";
import { Onboarding } from "./features/onboarding/Onboarding";
import { TestPanel } from "./features/test/TestPanel";
import { UpdateForm } from "./features/update/UpdateForm";

/**
 * Everything that is not the explorer-plus-detail workspace opens as a dialog
 * over it (Daniel's call, matching configr): selecting a capability is the one
 * in-page navigation.
 */
type DialogKind = null | "author" | "git" | "update" | "test";

export function App() {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const repo = useStudio((s) => s.repo);
  const items = useStudio((s) => s.items);
  const problems = useStudio((s) => s.problems);
  const error = useStudio((s) => s.error);
  const selected = useStudio((s) => s.selected);
  const current = useStudio(selectedItem);
  const init = useStudio((s) => s.init);
  const chooseRepo = useStudio((s) => s.chooseRepo);
  const select = useStudio((s) => s.select);

  useEffect(() => {
    void init();
  }, [init]);

  // After a successful add the watcher refreshes the list; show the new item.
  const onAdded = useCallback(
    (type: ComponentType, slug: string) => {
      select({ type, slug });
      setDialog(null);
    },
    [select]
  );

  const close = useCallback(() => setDialog(null), []);

  if (!repo) return <Onboarding error={error} onChoose={() => void chooseRepo()} />;

  const itemKey = current ? `${current.type}/${current.slug}` : "";
  return (
    <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)]">
      <AppHeader />
      <div className="grid min-h-0 grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-card">
          {error && (
            <p className="m-4 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <Explorer
            items={items}
            problems={problems}
            selected={selected}
            onSelect={select}
            onAddCapability={() => setDialog("author")}
            onGitStatus={() => setDialog("git")}
            onSwitchRepo={() => void chooseRepo()}
          />
        </aside>
        <section className="min-h-0 overflow-hidden">
          {current ? (
            <Detail key={itemKey} item={current} onEdit={() => setDialog("update")} onTest={() => setDialog("test")} />
          ) : (
            <p className="p-6 text-xs text-muted-foreground">Select an item, or add a capability.</p>
          )}
        </section>
      </div>

      {dialog === "author" && (
        <Modal title="registry-op run --op add-local" onClose={close} size="full">
          <AuthorForm onAdded={onAdded} />
        </Modal>
      )}
      {dialog === "git" && (
        <Modal title="git status" onClose={close} size="full">
          <GitPanel />
        </Modal>
      )}
      {dialog === "update" && current && (
        <Modal title={`edit ${itemKey}`} onClose={close} size="full">
          <UpdateForm key={itemKey} item={current} onDone={close} />
        </Modal>
      )}
      {dialog === "test" && current && (
        <Modal title={`test install ${itemKey}`} onClose={close} size="full">
          <TestPanel key={itemKey} item={current} />
        </Modal>
      )}
      <ExternalLinkDialog />
    </div>
  );
}
