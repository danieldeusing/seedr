import { writeFileSync } from "node:fs";
import { labelsPath } from "../fsPaths.js";
import { LABELS_VERSION, parseLabels } from "../labels.js";
import { itemKey } from "../paths.js";
import { listItems } from "../read.js";
import type { OpResult, SetLabelsOp } from "./types.js";

/**
 * Replace the whole label catalogue. Dropping a label that items still carry is
 * refused and the items are named: the alternative is silent orphaning — an item
 * pointing at a slug nothing defines, which every surface then renders as a
 * blank badge or drops from its filter.
 */
export function setLabels(registryDir: string, op: SetLabelsOp): OpResult {
  // Validated as the file it will become, so what is written is exactly what reads back.
  const labels = parseLabels({ version: LABELS_VERSION, labels: op.labels });
  const defined = new Set(labels.map((label) => label.slug));

  const orphaned = new Map<string, string[]>();
  for (const { type, slug, item } of listItems(registryDir)) {
    if (item.label === undefined || defined.has(item.label)) continue;
    orphaned.set(item.label, [...(orphaned.get(item.label) ?? []), itemKey(type, slug)]);
  }
  if (orphaned.size > 0) {
    const detail = [...orphaned].map(([label, items]) => `"${label}" (${items.join(", ")})`).join("; ");
    throw new Error(`Refusing to drop ${orphaned.size} label(s) items still carry: ${detail} — relabel those items first`);
  }

  writeFileSync(labelsPath(registryDir), JSON.stringify({ version: LABELS_VERSION, labels }, null, 2) + "\n");
  return { kind: op.kind, item: null, labels };
}
