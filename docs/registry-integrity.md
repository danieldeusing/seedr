# Registry integrity contract

This document is the single specification shared by the registry sync (`scripts/sync/*`),
the manifest compiler (`scripts/compile-manifest.ts`) and the CLI
(`packages/cli`). Both sides implement it independently and are tested against
the same fixtures; if you change one side, change the other and the fixtures.

## 1. Immutable source identity

Every item whose content is fetched from a remote repository carries:

| Field | Meaning |
| --- | --- |
| `sourceRevision` | The commit SHA (40 lowercase hex) the content was read from. The CLI fetches content **only** at this commit (`https://raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>`), never from a branch, so a multi-file item can never be assembled from two different upstream commits. |
| `contentDigest` | SHA-256 over the canonical file set (§2). The CLI downloads into a temporary directory, recomputes the digest and **refuses to install on a mismatch**. |
| `pluginSource` | Plugins only: the marketplace `source` descriptor (`marketplace-path`, `github`, `url`, `git-subdir`) with its effective `sha`. |
| `marketplaceRef` | Plugins only: `{ name, url, sha }` of the marketplace the entry was read from. |
| `license` | `{ spdx?, file?, installAs?, note? }` — see §3. |

First-party (`seedr`) items live in this repository. Their `contentDigest` is computed by
`pnpm compile` from the files on disk, and the CLI verifies it the same way after download.
They carry no `sourceRevision`: the compiled manifest and the files travel in the same commit.

`contentHash` (16 hex over git blob ids) is legacy and is kept only so older CLI builds keep
working. New code must not rely on it.

## 2. Canonical file set and digest

1. Take the item's `contents.files` tree. Walk it depth-first; a file's path is its node names
   joined with `/` (no leading `./`). Directories contribute nothing themselves.
2. If `license.installAs` is set and that path is not already in the tree, append it as an
   extra file whose content is the upstream file at `license.file`.
3. Sort the paths with plain code-unit comparison (`a < b`), i.e. `Array.prototype.sort()`
   with no locale.
4. For each path in order, append `path + "\n" + hex(sha256(bytes)) + "\n"` to a buffer.
5. `contentDigest = hex(sha256(buffer))`.

An empty file set has no digest (the field is omitted). A `contents.files` tree is the complete
list of files the CLI will download, so the tree is recorded to the full depth of the item
(the sync walks the git tree without a depth cap for digest purposes).

Binary files are hashed as bytes. Line endings are never normalised.

## 3. Licenses

At sync time the upstream tree is searched for `LICENSE`, `LICENSE.*`, `COPYING`, `COPYING.*`,
`NOTICE`, `NOTICE.*` (case-insensitive) — first inside the item directory, then at the source
repository root. The first match becomes `license.file`. If it is at the repository root and
therefore not part of the item tree, `license.installAs` is `"LICENSE"` (or `"NOTICE"`) and the
CLI writes the upstream text under that name next to the installed content, so redistributed
files always travel with their license. A best-effort SPDX guess (`MIT`, `Apache-2.0`,
`BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `MPL-2.0`, `GPL-3.0-only`) is stored in `license.spdx`.
When nothing is found, `license.note` records that no license text exists upstream.

## 4. Validation

`scripts/compile-manifest.ts` validates every `item.json` against this contract (slug
pattern `^[a-z0-9][a-z0-9-]*$`, folder/type/slug agreement, `(type, slug)` uniqueness,
`compatibility` values, `sourceType`, hex lengths of `sourceRevision`/`contentDigest`/
`pluginSource.sha`, `contents.files` node-name safety, `license` shape, and required
descriptions). CI recompiles the manifests and fails when the generated files differ from
the committed ones.

A community item added by hand carries its pin from the start: `/add-community` runs
`scripts/registry-op.ts pin <url>`, which reads the tree at the pinned commit and computes the
digest with the sync's own code, and the add operation refuses an item without one. The next
sync run re-pins it from its default branch — or from the official marketplace's pinned sha,
when that marketplace lists the repository.

## 5. Sync fail-closed rules

The sync stages a complete proposed registry in memory before touching the working tree.
A source (skills repo, plugins marketplace, each community item) is either **complete** or
**failed**; items from a failed source are carried over unchanged and nothing of that source is
deleted. Deletions are applied only for sources that completed and are capped by
`SYNC_MAX_DELETIONS` (default 5) — beyond that the run aborts and asks for review.
