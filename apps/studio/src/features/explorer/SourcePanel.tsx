import { useCallback, useEffect, useState } from "react";
import { FolderSearch, RefreshCw, Unlink } from "lucide-react";
import { isFirstParty, type SourceStatus } from "@seedr/registry-ops/pure";
import { itemHash, runRegistryOp, sourceStatusOf } from "@/api/registryCli";
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
  const [status, setStatus] = useState<SourceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingAdopt, setConfirmingAdopt] = useState(false);

  const firstParty = isFirstParty(item.item.sourceType);

  const look = useCallback(() => {
    if (!firstParty) return;
    setError(null);
    sourceStatusOf(item.type, item.slug).then(setStatus, (failure: Error) => setError(failure.message));
  }, [firstParty, item.type, item.slug]);

  useEffect(() => {
    setStatus(null);
    setConfirmingAdopt(false);
    look();
  }, [look]);

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
      look();
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
    </section>
  );
}
