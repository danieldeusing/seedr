import { useCallback, useEffect, useState } from "react";
import { closeDropdownsOnOutsidePress } from "@/core/lib/dropdowns";
import type { ComponentType } from "@seedr/shared";
import { AppHeader } from "./core/AppHeader";
import { ExternalLinkDialog } from "./core/ExternalLinkDialog";
import { Modal } from "./core/Modal";
import { PaneResizeHandle } from "./core/PaneResizeHandle";
import { useRememberedSize } from "./core/remembered";
import { AuthorForm } from "./features/author/AuthorForm";
import { Detail } from "./features/explorer/Detail";
import { Explorer } from "./features/explorer/Explorer";
import { selectedItem, useStudio } from "./features/explorer/store";
import { GitPanel } from "./features/git/GitPanel";
import { useMutations } from "./features/explorer/mutations";
import { Onboarding } from "./features/onboarding/Onboarding";
import { useAgentSettings } from "./features/settings/agentSettings";
import { SignInBanner } from "./features/settings/SignInBanner";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { TestPanel } from "./features/test/TestPanel";
import { UpdateForm } from "./features/update/UpdateForm";

/**
 * Everything that is not the explorer-plus-detail workspace opens as a dialog
 * over it (Daniel's call, matching configr): selecting a capability is the one
 * in-page navigation.
 */
type DialogKind = null | "author" | "git" | "update" | "test" | "settings";

export function App() {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const blocked = useMutations((state) => state.blocked);
  const settleBlocked = useMutations((state) => state.settleBlocked);

  /**
   * A removal refused for a dirty worktree opens git, where the changes and the
   * commit already live. Closing it finishes the removal if the worktree is
   * clean by then — the user armed and confirmed it before being sent here, and
   * making them confirm the same deletion twice because something unrelated was
   * uncommitted is a worse answer than continuing. Closing without committing
   * forgets it instead, so the item is back to a plain unarmed button rather
   * than showing a refusal that has to be cleared by hand.
   */
  useEffect(() => {
    if (blocked) setDialog("git");
  }, [blocked]);
  const [sidebarWidth, setSidebarWidth] = useRememberedSize("studio-sidebar-width", 288);
  const repo = useStudio((s) => s.repo);
  const items = useStudio((s) => s.items);
  const problems = useStudio((s) => s.problems);
  const error = useStudio((s) => s.error);
  const repoError = useStudio((s) => s.repoError);
  const clearRepoError = useStudio((s) => s.clearRepoError);
  const selected = useStudio((s) => s.selected);
  const current = useStudio(selectedItem);
  const init = useStudio((s) => s.init);
  const chooseRepo = useStudio((s) => s.chooseRepo);
  const select = useStudio((s) => s.select);
  const initAgents = useAgentSettings((s) => s.init);

  useEffect(closeDropdownsOnOutsidePress, []);

  useEffect(() => {
    void init();
    // Custom agent paths reach the host before anything asks an agent to run.
    void initAgents();
  }, [init, initAgents]);

  // After a successful add the watcher refreshes the list; show the new item.
  // Select what was added, but leave the dialog open: a finished job has a
  // report and a log worth reading, and closing the window over them makes the
  // work look like it vanished. Closing is the reader's call.
  const onAdded = useCallback((type: ComponentType, slug: string) => select({ type, slug }), [select]);

  const close = useCallback(() => setDialog(null), []);

  if (!repo) return <Onboarding error={repoError ?? error} onChoose={() => void chooseRepo()} />;

  const itemKey = current ? `${current.type}/${current.slug}` : "";
  // A column, not a three-row grid: the banner renders only when an agent is
  // signed out, and with it gone the fixed template left the workspace in an
  // `auto` row with the `1fr` row below it empty — so the empty row took the
  // free height and showed as dead space under a short registry. A column gives
  // the workspace what is left however many siblings it has.
  return (
    <div data-testid="app-shell" className="flex h-screen flex-col">
      <AppHeader />
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `${sidebarWidth}px auto minmax(0,1fr)` }} data-testid="workspace">
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
            onSettings={() => setDialog("settings")}
          />
        </aside>
        <PaneResizeHandle label="resize sidebar" onResize={(delta) => setSidebarWidth((width) => Math.max(200, Math.min(600, width + delta)))} />
        <section className="flex min-h-0 flex-col overflow-hidden">
          {/* Beside the explorer rather than above it: the explorer is a list of
              items, and a signed-out CLI is about the work done to one. */}
          <SignInBanner />
          <div className="min-h-0 flex-1">
            {current ? (
              <Detail key={itemKey} item={current} onEdit={() => setDialog("update")} onTest={() => setDialog("test")} />
            ) : (
              <p className="p-6 text-xs text-muted-foreground">Select an item, or add a capability.</p>
            )}
          </div>
        </section>
      </div>

      {dialog === "author" && (
        <Modal title="registry-op run --op add-local" onClose={close} size="full">
          <AuthorForm onAdded={onAdded} />
        </Modal>
      )}
      {dialog === "git" && (
        <Modal
          title="git"
          onClose={() => {
            close();
            void settleBlocked();
          }}
          size="full"
        >
          <GitPanel />
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title="settings" onClose={close} size="full">
          <SettingsPanel />
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
      {/* Picking a folder is a deliberate act, so its refusal gets a dialog. A
          line in the sidebar reads as nothing having happened, which is exactly
          how a rejected checkout was reported before. */}
      {repoError && (
        <Modal title="that folder cannot be opened" onClose={clearRepoError} size="lg">
          <section className="p-6 text-xs">
            <p className="text-destructive" role="alert">
              {repoError}
            </p>
            <p className="mt-3 text-muted-foreground">
              Studio opens a folder that holds a <code className="text-primary">registry/</code> directory — or the one its{" "}
              <code className="text-primary">seedr.config.json</code> names instead. It is still open on {repo.name}.
            </p>
            <button type="button" onClick={clearRepoError} className="doc-link doc-link--forward mt-4 cursor-pointer text-sm">
              back to {repo.name}
            </button>
          </section>
        </Modal>
      )}
      <ExternalLinkDialog />
    </div>
  );
}
