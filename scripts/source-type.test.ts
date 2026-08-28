import { describe, expect, it } from "vitest";
import { readAllItems } from "./compile-manifest.js";
import { PLUGINS_REPO, SKILLS_REPO } from "./sync/anthropic.js";

/**
 * Who published an item, checked against the registry that actually ships.
 *
 * A unit test on the sync would only prove the rule; this proves the data, which
 * is what a person reads. The two can drift: an item written under an older rule
 * keeps its old answer until something re-syncs it, and nothing would say so.
 */
const items = readAllItems();
const repoOf = (url: string | undefined): string =>
  url?.startsWith("https://github.com/") ? url.replace("https://github.com/", "").split("/tree/")[0]! : "";

describe("what a source type claims about an item", () => {
  it("nothing published from Anthropic's own repositories calls itself a community contribution", () => {
    // The badge reads "Community contribution" for community and "Published by
    // the tool maker" for official, so this is not a label: it tells a reader
    // who stands behind the thing they are about to install.
    //
    // 15 plugins failed this — github, linear, terraform, playwright and the
    // rest of `external_plugins/` — because the rule tested which DIRECTORY of
    // Anthropic's marketplace they sat in, and that folder was not the one it
    // knew about.
    const mislabelled = items
      .filter((item) => [PLUGINS_REPO, SKILLS_REPO].includes(repoOf(item.externalUrl)) && item.sourceType === "community")
      .map((item) => `${item.type}/${item.slug}`);

    expect(mislabelled).toEqual([]);
  });

  it("nothing published from somebody else's repository calls itself official", () => {
    // The other direction, which matters just as much: being listed in the
    // official marketplace is not the same as being published by Anthropic, and
    // an entry may point its source at a third-party repository.
    const overclaimed = items
      .filter((item) => item.sourceType === "official" && item.externalUrl && ![PLUGINS_REPO, SKILLS_REPO].includes(repoOf(item.externalUrl)))
      .map((item) => `${item.type}/${item.slug} → ${repoOf(item.externalUrl)}`);

    expect(overclaimed).toEqual([]);
  });
});
