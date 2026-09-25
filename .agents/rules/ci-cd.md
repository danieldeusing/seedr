---
paths:
  - .github/workflows/**
  - packages/cli/package.json
---

# CI / CD and npm publishing

## Workflows

GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | Does |
|----------|---------|------|
| `ci.yml` | push to `main`, any PR | Main job: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check-descriptions`. Matrix job (ubuntu/windows/macos): registry-ops tests, script tests, `cargo test` for the Studio host |
| `deploy.yml` | push to `prod` | Deploy web to Cloudflare Pages + publish CLI to npm |
| `sync.yml` | schedule / manual | Mirror Anthropic's three plugin marketplaces (official, knowledge-work, community — about 2,600 plugins) and the official skills, and re-sync the remaining community items from their GitHub repos |
| `test-email.yml` | manual | Smoke-test the SMTP sync-notification setup |

## npm Publishing

The CLI is published to npm as `@danieldeusing/seedr`. Push to `prod` branch triggers `.github/workflows/deploy.yml` (publish-cli job).

### How CI auth works

Publishing uses **npm Trusted Publishers (OIDC)** — no npm tokens needed. Requirements:

1. `packages/cli/package.json` must have a `repository` field matching the GitHub repo
2. The workflow must have `id-token: write` permission
3. **On npmjs.com**: the package must have a Trusted Publisher configured (package Settings → Trusted Publisher → add repo + workflow filename)

### GitHub secrets needed

- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` — Cloudflare Pages deploys (deploy-web job)
- Version bump commits and registry sync pushes use the default `GITHUB_TOKEN` (no extra secrets)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` — sync notification emails
