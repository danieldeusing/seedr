import { useSyncExternalStore } from "react";

/*
 * The footer's animation toggle. The html element carries the gate the design
 * system's CSS reads: `term-anim` arms the terminal typing session, `anim-off`
 * kills every keyframe (and, via index.css, every transition). index.html sets
 * the initial state pre-paint from localStorage "anim" and prefers-reduced-motion;
 * this module changes it at runtime and tells useTerminalSession to re-arm.
 */

const STORAGE_KEY = "anim";
const listeners = new Set<() => void>();
// bumped on every change so a terminal session restarts without a reload
let epoch = 0;

export function isAnimationEnabled(): boolean {
  return document.documentElement.classList.contains("term-anim");
}

export function setAnimationEnabled(enabled: boolean): void {
  const html = document.documentElement;
  html.classList.toggle("term-anim", enabled);
  html.classList.toggle("anim-off", !enabled);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* private mode: the choice still applies until the next load */
  }
  epoch += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever the toggle flips; effects that key on it replay their animation. */
export function useAnimationEpoch(): number {
  return useSyncExternalStore(subscribe, () => epoch, () => 0);
}

export function useAnimationEnabled(): boolean {
  return useSyncExternalStore(subscribe, isAnimationEnabled, () => true);
}
