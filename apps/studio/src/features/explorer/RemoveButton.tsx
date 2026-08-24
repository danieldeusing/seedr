import { useEffect, useState } from "react";
import type { StudioItem } from "./registry";
import { Check, Trash2, X } from "lucide-react";
import { IconButton } from "@/core/ui/IconButton";
import { removalRefusal, useMutations } from "./mutations";

/** A two-step remove: the first press arms it, the second runs the transaction. */
export function RemoveButton({ item }: { item: StudioItem }) {
  const [armed, setArmed] = useState(false);
  const phase = useMutations((s) => s.phase);
  const error = useMutations((s) => s.error);
  const arm = useMutations((s) => s.arm);
  const remove = useMutations((s) => s.remove);
  const reset = useMutations((s) => s.reset);
  const refusal = removalRefusal(item);

  useEffect(() => {
    setArmed(false);
    reset();
  }, [item.type, item.slug, reset]);

  if (refusal) {
    // The reason lives in the hover (estate rule: data-tip, no inline furniture);
    // the disabled bin still names itself and carries the reason for readers too.
    return (
      <span data-tip={refusal}>
        <IconButton icon={Trash2} ariaLabel={`remove ${item.slug} — ${refusal}`} accentColor="red" disabled />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      {phase === "done" ? (
        <span className="text-sm text-green-400" role="status">
          removed
        </span>
      ) : armed ? (
        <>
          <IconButton
            icon={Check}
            ariaLabel={`confirm remove ${item.type}/${item.slug}`}
            tip={`confirm remove ${item.type}/${item.slug}`}
            accentColor="red"
            active
            onClick={() => void remove(item)}
            disabled={phase === "removing"}
            spin={phase === "removing"}
          />
          <IconButton icon={X} ariaLabel="keep" tip="keep the item" onClick={() => setArmed(false)} disabled={phase === "removing"} />
        </>
      ) : (
        <IconButton
          icon={Trash2}
          ariaLabel={`remove ${item.slug}`}
          tip="remove from the registry"
          accentColor="red"
          onClick={() => {
            setArmed(true);
            void arm(item);
          }}
        />
      )}
      {error && (
        <span className="text-destructive" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
