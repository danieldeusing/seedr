import { useEffect, useState } from "react";
import type { StudioItem } from "./registry";
import { removalRefusal, useMutations } from "./mutations";

/** A two-step remove: the first press arms it, the second runs the transaction. */
export function RemoveButton({ item }: { item: StudioItem }) {
  const [armed, setArmed] = useState(false);
  const phase = useMutations((s) => s.phase);
  const error = useMutations((s) => s.error);
  const remove = useMutations((s) => s.remove);
  const reset = useMutations((s) => s.reset);
  const refusal = removalRefusal(item);

  useEffect(() => {
    setArmed(false);
    reset();
  }, [item.type, item.slug, reset]);

  if (refusal) {
    return (
      <span className="text-xs text-muted-foreground" title={refusal}>
        <button type="button" className="btn-terminal btn-terminal--ghost btn-terminal--destructive" aria-label={`remove ${item.slug}`} disabled />
        {refusal}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      {armed ? (
        <>
          <button type="button" onClick={() => void remove(item)} className="btn-terminal btn-terminal--compact" disabled={phase === "removing"}>
            {phase === "removing" ? "removing…" : `confirm remove ${item.type}/${item.slug}`}
          </button>
          <button type="button" onClick={() => setArmed(false)} className="btn-terminal btn-terminal--ghost btn-terminal--compact" disabled={phase === "removing"}>
            keep
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className="btn-terminal btn-terminal--ghost btn-terminal--destructive" aria-label={`remove ${item.slug}`} />
      )}
      {error && (
        <span className="text-destructive" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
