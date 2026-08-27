import { useEffect, useRef, useState } from "react";

/**
 * A pane size — a width or a height — that outlives both a remount and the
 * session.
 *
 * The detail pane is keyed by the item, so picking another capability builds a
 * fresh one — a size set by dragging was lost on the very next click, not only
 * on the next launch. Reading the stored value as the initial state fixes both
 * at once, because a remount is just another first render.
 *
 * The write is deferred: a drag changes the size on every pointer move, and
 * `localStorage` is synchronous. Only where the drag stopped is worth keeping.
 */
const SETTLE_MS = 300;

const stored = (key: string, fallback: number): number => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    // A webview with storage disabled still gets a working pane.
    return fallback;
  }
};

export function useRememberedSize(key: string, fallback: number): [number, (next: (size: number) => number) => void] {
  const [size, setSize] = useState(() => stored(key, fallback));
  const timer = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(key, String(size));
      } catch {
        // Nothing to do about it, and nothing worth interrupting a drag for.
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer.current);
  }, [key, size]);

  return [size, setSize];
}

