import { ArrowDown, ArrowUp, CloudOff, RotateCw } from "lucide-react";
import { useStudio } from "@/features/explorer/store";

/**
 * Whether this checkout still shows the current list of capabilities.
 *
 * Studio is run on more than one host against the same registry, so the list on
 * screen is only as current as the last pull — and nothing else in the app would
 * ever say otherwise. Being behind is not an error the user made, but it does
 * mean what they are reading is out of date, which is worth a line in the title
 * bar and not a page in settings.
 *
 * Silent when there is nothing to say, like RepoBadge: a checkout level with its
 * upstream shows nothing at all, because a badge that is always lit is a badge
 * nobody reads. Ahead-only is deliberately quiet — unpushed work is a normal
 * state, and the reason it is mentioned at all is that the OTHER host cannot see
 * it yet.
 *
 * A failed fetch is never rounded to "up to date". It says the remote could not
 * be reached, because "0 behind" from a checkout that never asked is exactly the
 * false reassurance this component exists to prevent.
 */
export function RemoteBadge() {
  const remote = useStudio((state) => state.remote);
  const checking = useStudio((state) => state.remoteChecking);
  const check = useStudio((state) => state.checkRemote);

  // Nothing to say: no upstream to compare against, or level with it and the
  // answer rests on a fetch that got through.
  const silent = !remote || (remote.upstream === null) || (remote.fetched && remote.behind === 0 && remote.ahead === 0);
  if (silent && !checking) return null;

  const ask = () => void check(true);

  if (checking && !remote) {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <RotateCw className="size-3.5 animate-spin" aria-hidden="true" />
        <span>checking origin…</span>
      </span>
    );
  }
  if (!remote) return null;

  return (
    <button
      type="button"
      className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 hover:opacity-80"
      onClick={ask}
      disabled={checking}
      data-tip={remote.fetched ? `Compared against ${remote.upstream}. Click to fetch again.` : "Click to try the remote again"}
    >
      {!remote.fetched ? (
        <span className="flex items-center gap-1.5 text-amber-300" role="status">
          <CloudOff className="size-3.5" aria-hidden="true" />
          <span>could not reach {remote.upstream} — this list may be stale</span>
        </span>
      ) : (
        <>
          {remote.behind > 0 && (
            <span className="flex items-center gap-1.5 text-destructive" role="alert">
              <ArrowDown className="size-3.5" aria-hidden="true" />
              <span>
                {remote.behind} behind {remote.upstream} — pull
              </span>
            </span>
          )}
          {remote.ahead > 0 && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowUp className="size-3.5" aria-hidden="true" />
              <span>{remote.ahead} unpushed</span>
            </span>
          )}
        </>
      )}
      {checking && <RotateCw className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
    </button>
  );
}
