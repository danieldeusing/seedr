# Git Workflow

## The two branches

| Branch | Holds | Who commits here |
|---|---|---|
| `main` | The code — what a fork starts from — plus the registry the daily sync maintains. | You. Every code change lands on `main` first. |
| `prod` | What is deployed: `main` promoted by merge, plus the release commits the deploy makes. | Automation, and `git merge main`. Never a hand-written code commit. |

**`prod` being ahead of `main` is the normal state, not a problem to fix.** Every release
commits its version bump on `prod` and carries a *different* commit to `main`, so the branches
diverge by design. "prod is N commits ahead" is never a reason to merge `prod` into `main`.

## Check the branch before touching code

A checkout can be sitting on `prod` — a promotion leaves it there. Run
`git branch --show-current` first; if it says `prod`, run `git checkout main` before changing
anything. Code committed on `prod` is stranded: it deploys, but never reaches the branch people
fork, and `main` silently falls behind. Seven such commits were found and recovered in 2026-09.

## Promote `main` → `prod` with a merge

```bash
git checkout main && git pull --ff-only origin main
git checkout prod && git pull --ff-only origin prod
git merge main          # a merge commit — never --ff-only; the branches have diverged by design
git push origin prod    # deploys the site, and publishes the CLI when packages/cli or registry/ changed
```

Only ever in this direction. `git push origin main:prod` is rejected (not a fast-forward), and
merging `prod` into `main` is the mistake this file exists to prevent.

## What automation owns — never do it by hand

- **`sync.yml`** (daily): checks out `main`, adds registry items, pushes to **both** `main` and
  `prod`, then dispatches a deploy. `main` is the registry's source of truth; `prod` mirrors it.
- **`deploy.yml`** (on push to `prod`): deploys, bumps and tags the version on `prod`, then
  carries the bump commit to `main` best-effort.

## Never Skip Hooks

Do NOT use `--no-verify` to bypass pre-commit hooks. If a hook blocks the commit, fix the
underlying issue instead of bypassing it.

## Never Cherry-Pick Between Branches

Do NOT use `git cherry-pick` to move commits between `main`, `prod` or `feat/*`. Cherry-pick
creates different commit SHAs, which breaks the CI workflows that push between branches.
Promote with a merge instead (above), so the same commit exists on both.

## Never Amend Already-Pushed Commits

Do NOT use `git commit --amend` on commits that have already been pushed. Amending requires a
force-push, and force-pushing to `prod` re-triggers the deploy workflow, which fails on npm
publish if the version was already published by the original push.

Instead, create a **new commit** with the fix. A clean fixup commit is always safer than
rewriting pushed history.
