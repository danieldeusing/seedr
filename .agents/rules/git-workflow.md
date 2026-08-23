# Git Workflow

## Never Skip Hooks

Do NOT use `--no-verify` to bypass pre-commit hooks. If a hook blocks the commit, fix the underlying issue instead of bypassing it.

## Never Cherry-Pick Between Branches

Do NOT use `git cherry-pick` to sync commits across branches (`main`, `prod`, `feat/*`).
Cherry-pick creates different commit SHAs, which breaks CI workflows that push between branches.

Instead, when pushing a commit to multiple branches:
1. Commit and push to `main` first
2. Merge `main` into the other branches: `git checkout prod && git merge main && git push origin prod`
3. This preserves identical commit SHAs across branches

## Never Amend Already-Pushed Commits

Do NOT use `git commit --amend` on commits that have already been pushed. Amending requires a force-push, and force-pushing to `prod` re-triggers the deploy workflow which will fail on npm publish if the version was already published by the original push.

Instead, create a **new commit** with the fix. A clean fixup commit is always safer than rewriting pushed history.
