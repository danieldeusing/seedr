/**
 * Content digest per docs/registry-integrity.md §2.
 *
 * The CLI recomputes this over the files it downloaded and refuses to install on a
 * mismatch, so the algorithm must stay byte-for-byte identical on both sides:
 *
 *   1. one entry per file: path relative to the item root, "/"-separated, no "./"
 *   2. paths sorted by plain code-unit comparison (no locale)
 *   3. buffer = concat of `path + "\n" + hex(sha256(bytes)) + "\n"` per entry
 *   4. digest = hex(sha256(buffer))
 *
 * Binary files are hashed as bytes; line endings are never normalised.
 */

import { createHash } from "node:crypto";

export interface DigestEntry {
  path: string;
  bytes: Uint8Array;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Returns `null` for an empty file set — the contract omits the field in that case. */
export function computeContentDigest(entries: readonly DigestEntry[]): string | null {
  if (entries.length === 0) return null;

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.path)) {
      throw new Error(`Duplicate path in digest input: "${entry.path}"`);
    }
    seen.add(entry.path);
  }

  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const buffer = createHash("sha256");
  for (const entry of sorted) {
    buffer.update(`${entry.path}\n${sha256Hex(entry.bytes)}\n`);
  }
  return buffer.digest("hex");
}
