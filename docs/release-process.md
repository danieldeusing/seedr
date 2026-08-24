# Release and promotion process

There is **one** promotion path into production, and every step of it runs the same
validation pipeline (`.github/workflows/validate.yml`): lint, typecheck, CLI unit tests
with coverage thresholds, registry script tests, web unit + API tests, build, description
gate, *generated manifests match their sources*, production dependency audit (fails on
`moderate` and above), package-contents check, and the browser suites (responsive, navigation,
accessibility, routing).

## Branches

| Branch | Role |
|--------|------|
| `main` | Development. **Every installed CLI reads the registry data from `main`** (`packages/cli/src/config/registry.ts`), so a registry change merged to `main` is live for CLI users immediately. |
| `prod` | What the website deploys from and what the CLI is published from. |

## The three workflows

### `ci.yml` — push to `main`, pull requests

Calls `validate.yml` on the pushed commit. No side effects.

### `sync.yml` — nightly registry sync (06:00 UTC) and manual dispatch

1. `sync` job: runs `pnpm sync` on `main`. The sync **fails closed**: each upstream source
   is either complete or failed, items from failed sources are carried over unchanged, an
   item whose metadata request fails is never treated as a deletion, and more than
   `SYNC_MAX_DELETIONS` (default 5) proposed deletions abort the run for review. If anything
   changed, the commit is pushed to a temporary branch `sync/<run-id>`.
2. `validate` job: the full pipeline on that candidate commit.
3. `promote` job (only if validation passed): fast-forwards `main` to the validated commit
   (refuses if `main` moved meanwhile), replays the registry commit onto `prod`, deletes the
   candidate branch and dispatches `deploy.yml` for `prod` (pushes made with `GITHUB_TOKEN`
   never trigger workflows, so the dispatch *is* the single deploy trigger).
4. `notify` job: emails the list of new items.

### `deploy.yml` — push to `prod` and manual dispatch

1. `validate`: the full pipeline on the exact commit being promoted. Nothing below runs
   unless it passes.
2. `deploy-web` (environment `production`): builds and deploys to Cloudflare Pages.
3. `publish-cli` (environment `production`): decides whether a CLI release is due (manual
   version bump ahead of npm, or CLI/registry/shared changes since the last version commit).
   If a bump is needed it **commits the bump, tags `cli-v<version>` and pushes both to
   `prod` before publishing** — a rejected push fails the job and nothing is published. It
   then builds the committed tree and runs `npm publish --provenance`. The provenance
   attestation therefore always points at a commit that contains the published version.
   Finally it carries the bump commit to `main` (best effort; a failure here is a warning
   because the release source already exists on `prod` and is tagged).

`sync.yml` and `deploy.yml` share the concurrency group `production-promotion`, so a sync
promotion and a release never interleave. Third-party actions are pinned to commit SHAs;
jobs declare the minimum permissions they need; npm is pinned to a reviewed version
(trusted publishing needs npm ≥ 11.5.1).

## Operator setup (one-time, outside the repository)

- **GitHub environment `production`**: create it and, if you want a human gate, add required
  reviewers. Both production jobs reference it.
- **Branch protection** for `main` and `prod`: require the `Validate` checks, disallow force
  pushes.
- **Repository variables** (fork safety — nothing is hardcoded to the upstream author):
  `NOTIFY_EMAIL` (sync notification recipient; falls back to `SMTP_USERNAME`), `SITE_URL`.
- **Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SMTP_*`. npm needs no
  token — trusted publishing is configured on npmjs.com for this repository and the
  `deploy.yml` workflow file name.

## Releasing by hand

```bash
git checkout main && git pull --ff-only
git checkout prod && git pull --ff-only
git merge main            # never cherry-pick between branches, never amend pushed commits
git push origin prod      # triggers deploy.yml: validate → deploy web → publish CLI
```

To force a CLI release without code changes, bump `packages/cli/package.json` on `main`
first; a version strictly greater than the published one is released as-is.
