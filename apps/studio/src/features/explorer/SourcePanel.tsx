import { useCallback, useEffect, useState } from "react";
import { FileDiff, FolderSearch, RefreshCw, RotateCw, Unlink } from "lucide-react";
import { isFirstParty, type SourceStatus } from "@seedr/registry-ops/pure";
import { itemHash, runRegistryOp, sourceDiffOf } from "@/api/registryCli";
import { DiffText } from "@/core/ui/DiffText";
import { IconButton } from "@/core/ui/IconButton";
import { useStudio } from "./store";
import type { StudioItem } from "./registry";

/**
 * Where a first-party item was copied from, and whether that folder has moved on
 * since. The check runs in the operations CLI, not here: the folder is outside
 * the checkout, and the host refuses to read anything that is.
 *
 * Only two things can be done about it, and both are deliberate acts rather than
 * something that happens on its own — a copy is not a subscription.
 */
const WORDING: Record<SourceStatus["state"], { label: string; tone: string; detail: string }> = {
  none: { label: "", tone: "", detail: "" },
  current: { label: "in sync", tone: "text-success", detail: "The folder is where it was, and unchanged since the last copy." },
  behind: { label: "source has changes", tone: "text-amber-400", detail: "The folder has been edited since this item was copied from it." },
  edited: { label: "changed here", tone: "text-primary", detail: "This copy has been edited and the folder has not. Copying across would undo that work." },
  diverged: { label: "both have changed", tone: "text-destructive", detail: "The folder and this copy have each been edited. Copying across keeps the folder's version and loses the edits made here." },
  missing: { label: "source is gone", tone: "text-destructive", detail: "The folder is no longer there. Adopt the item to stop looking for it." },
};

export function SourcePanel({ item }: { item: StudioItem }) {
  const refresh = useStudio((state) => state.refresh);
  const checkSources = useStudio((state) => state.checkSources);
  // Read from the one batch answer rather than asking again: each ask is a
  // process, and the batch already carries this item's path and digests.
  const status = useStudio((store) => store.sourceStates[`${item.type}/${item.slug}`] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingAdopt, setConfirmingAdopt] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);

  const firstParty = isFirstParty(item.item.sourceType);

  const look = useCallback(() => {
    if (!firstParty) return;
    setError(null);
    void checkSources(true);
  }, [firstParty, checkSources]);

  useEffect(() => {
    setConfirmingAdopt(false);
    // Asks only if nobody has asked recently: the registry refresh usually has,
    // and then this costs nothing.
    void checkSources();
  }, [item.type, item.slug, checkSources]);

  useEffect(() => {
    // Nothing watches the source folder — it is outside the checkout, and the
    // host refuses every path that is. Coming back to the window is the moment
    // the answer is most likely to have changed, because editing the file is
    // what you left to do.
    const onFocus = () => {
      void checkSources();
      // Cheap next to the source check — `git status` rather than a Node start —
      // and the badge is stale the moment anything is committed elsewhere.
      void useStudio.getState().countUncommitted();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkSources]);

  // A synced item is upstream's, and one that records no source is nobody's copy;
  // neither has anything to say here, so neither gets a panel.
  if (!firstParty || (status?.state ?? "none") === "none") return null;

  const run = async (kind: "resync-source" | "adopt-source") => {
    setBusy(true);
    setError(null);
    try {
      const expectedHash = await itemHash(item.type, item.slug);
      await runRegistryOp({ v: 1, kind, type: item.type, slug: item.slug, expectedHash });
      await refresh();
      void checkSources(true);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
      setConfirmingAdopt(false);
    }
  };

  const state = status?.state ?? "none";
  const wording = WORDING[state];

  return (
    <section className="mt-6">
      <p className="prompt text-xs">registry-op source-status {item.type} {item.slug}</p>
      <div className="mt-2 border border-border p-3 text-xs">
        <div className="flex items-center gap-2">
          <FolderSearch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">copied from</span>
          <span className={`ml-auto ${wording.tone}`} role="status">
            {wording.label}
          </span>
        </div>
        {/* No `data-tip`: the path wraps and is shown in full, so a hover would
            repeat it and cover the line beneath. */}
        <p className="mt-1 break-all text-muted-foreground">{status?.path}</p>
        <p className="mt-2 text-muted-foreground">{wording.detail}</p>

        {error && (
          <p className="mt-2 text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          {(state === "behind" || state === "edited" || state === "diverged") && (
            <IconButton
              icon={FileDiff}
              ariaLabel="show the difference"
              tip="What the folder has that this copy does not, and the other way round"
              onClick={() => {
                setDiff("");
                sourceDiffOf(item.type, item.slug).then(setDiff, (failure: Error) => {
                  setDiff(null);
                  setError(failure.message);
                });
              }}
              disabled={busy}
            />
          )}
          <IconButton
            icon={RotateCw}
            ariaLabel="check the source again"
            tip="Look at the folder again"
            onClick={look}
            disabled={busy}
          />
          {(state === "behind" || state === "diverged") && (
            <IconButton
              icon={RefreshCw}
              ariaLabel="copy the changes across"
              tip={state === "diverged" ? "Copy the source across, losing the edits made here" : "Copy the source's content across again, replacing this item's files"}
              accentColor={state === "diverged" ? "red" : "violet"}
              onClick={() => void run("resync-source")}
              disabled={busy}
              spin={busy}
            />
          )}
          {confirmingAdopt ? (
            <>
              <span className="text-amber-300">Studio keeps this item and stops checking the folder. Confirm?</span>
              <IconButton icon={Unlink} ariaLabel="confirm adopting the item" tip="Adopt it" accentColor="red" active onClick={() => void run("adopt-source")} disabled={busy} spin={busy} />
              <button type="button" className="cursor-pointer text-muted-foreground hover:text-primary" onClick={() => setConfirmingAdopt(false)}>
                keep the link
              </button>
            </>
          ) : (
            <IconButton icon={Unlink} ariaLabel="adopt this item" tip="Stop tracking the folder — Studio manages this item from now on" onClick={() => setConfirmingAdopt(true)} disabled={busy} />
          )}
        </div>
      </div>
      {diff !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="source difference">
          <div className="absolute inset-0 bg-[var(--dialog-backdrop)] backdrop-blur-sm" onClick={() => setDiff(null)} />
          <div className="relative mx-4 flex max-h-[80vh] w-full max-w-4xl flex-col border border-neutral-700 bg-neutral-980 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-neutral-960 px-6 py-4">
              <FileDiff className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-white">
                {item.type}/{item.slug}
              </h3>
              <span className="ml-auto text-muted-foreground">source → registry</span>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-4 leading-relaxed" data-testid="source-diff">
              {diff === "" ? "reading…" : diff.trim() === "" ? "The files are identical." : <DiffText text={diff} />}
            </pre>
            <div className="flex justify-end border-t border-neutral-960 px-6 py-3">
              <button type="button" className="cursor-pointer border border-violet-500/30 px-3 py-1 text-neutral-200 transition-colors hover:border-violet-500 hover:text-violet-300" onClick={() => setDiff(null)}>
                close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
