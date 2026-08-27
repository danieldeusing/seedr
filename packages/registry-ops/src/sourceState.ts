/**
 * The vocabulary for "where did this item come from", with no filesystem in it,
 * so Studio's webview and the CLI describe the same four states rather than each
 * spelling their own.
 */

export type SourceState =
  /** The item records no origin: written in place, or its origin was adopted. */
  | "none"
  /** The source is where it was, and unchanged since the last copy. */
  | "current"
  /** The source is there and has changed — the item is behind it. */
  | "behind"
  /** The source has not moved, but the copy here has: local work, not yet upstream. */
  | "edited"
  /** Both moved. Copying across overwrites the work done here; leaving it strands the source. */
  | "diverged"
  /** The recorded path is not there any more. Adopt the item, or point it elsewhere. */
  | "missing";

export interface SourceStatus {
  state: SourceState;
  /** The recorded path, absent when the item records no origin. */
  path?: string;
  /** The digest recorded when the item was last copied from the source. */
  recorded?: string | null;
  /** The source's digest now; null when it is gone or has no content files. */
  current?: string | null;
}
