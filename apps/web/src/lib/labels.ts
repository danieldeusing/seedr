/*
 * The label catalogue: the projects a registry item can belong to.
 *
 * Definitions live in registry/labels.json and are compiled into the registry
 * index, so adding a label is a registry change and never a code change here.
 *
 * The cast is load-bearing: TypeScript widens the colour of a JSON literal to
 * `string`, which no longer fits `LabelColor`. The fallback covers an index
 * compiled before labels existed, which would otherwise crash on first render.
 */
import indexData from "@registry/manifest.json";
import type { LabelDefinition } from "./types";

export const labelCatalogue = (indexData.labels ?? []) as LabelDefinition[];

/** The catalogue entry a slug names; undefined for an absent or unknown slug. */
export function labelDefinition(slug: string | undefined): LabelDefinition | undefined {
  return labelCatalogue.find((definition) => definition.slug === slug);
}
