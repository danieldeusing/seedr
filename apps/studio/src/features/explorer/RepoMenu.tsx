import { useEffect, useState } from "react";
import { FolderInput } from "lucide-react";
import { defaultRepo, type RepoInfo } from "@/api/repo";
import { useStudio } from "./store";
import { readHistory, repoLabel } from "./repoHistory";

/**
 * Where Studio is pointed, and everywhere it has been pointed before.
 *
 * A button that only opened the native picker meant re-navigating to the same
 * two or three checkouts all day. The picker is still the first entry, because
 * it is the only way to reach a checkout that is not yet known.
 *
 * The default is listed separately even when it is also in the history: it is
 * the one every other checkout is measured against — the title bar reddens for
 * any other — so it is worth naming as that rather than as one path among
 * several.
 */
export function RepoMenu() {
  const repo = useStudio((state) => state.repo);
  const chooseRepo = useStudio((state) => state.chooseRepo);
  const openRepo = useStudio((state) => state.openRepo);
  const [history, setHistory] = useState<string[]>([]);
  const [fallback, setFallback] = useState<RepoInfo | null>(null);

  // Re-read on every change of checkout: opening one rewrites the order.
  useEffect(() => {
    setHistory(readHistory());
    void defaultRepo().then(setFallback, () => setFallback(null));
  }, [repo]);

  const current = repo?.root ?? "";
  const home = fallback?.root ?? "";
  const others = history.filter((path) => path !== current && path !== home);

  const close = (event: { currentTarget: HTMLElement }) => event.currentTarget.closest("details")?.removeAttribute("open");
  const entry = "flex w-full cursor-pointer items-center gap-2 px-4 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700 text-neutral-400";

  return (
    <details className="dropdown relative">
      <summary
        aria-label="switch repo"
        data-tip="Point Studio at another seedr checkout — e.g. a private fork"
        className="flex h-7 w-9 cursor-pointer list-none items-center justify-center border border-neutral-500/30 text-neutral-400 transition-colors hover:border-neutral-500/40 hover:bg-neutral-500/20 hover:text-neutral-300"
      >
        <FolderInput className="size-3.5" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 bottom-full z-[9999] mb-2 min-w-56 overflow-hidden border border-neutral-600 bg-[var(--popover)] py-1 whitespace-nowrap shadow-xl" role="menu" aria-label="checkouts">
        <button
          type="button"
          role="menuitem"
          className={entry}
          onClick={(event) => {
            close(event);
            void chooseRepo();
          }}
        >
          Open…
        </button>

        {home && (
          <button
            type="button"
            role="menuitem"
            className={`${entry} ${home === current ? "bg-violet-500/20 text-neutral-200" : ""}`}
            aria-current={home === current ? "true" : undefined}
            title={home}
            onClick={(event) => {
              close(event);
              if (home !== current) void openRepo(home);
            }}
          >
            default ({repoLabel(home)})
          </button>
        )}

        {current && current !== home && (
          <button type="button" role="menuitem" className={`${entry} bg-violet-500/20 text-neutral-200`} aria-current="true" title={current} onClick={close}>
            {repoLabel(current)}
          </button>
        )}

        {others.map((path) => (
          <button
            key={path}
            type="button"
            role="menuitem"
            className={entry}
            title={path}
            onClick={(event) => {
              close(event);
              void openRepo(path);
            }}
          >
            {repoLabel(path)}
          </button>
        ))}
      </div>
    </details>
  );
}
