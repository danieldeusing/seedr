# Self-Hosting Seedr

Run your own private seedr instance — your own registry, web UI, and CLI — for your team or company.

**Two deployment options:**

| Option | Best for | Requires |
|--------|----------|----------|
| [Cloudflare Pages](#step-6a-deploy-to-cloudflare-pages) | Public or private instances with zero server management | Cloudflare account (free tier works) |
| [Linux server](#step-6b-deploy-to-a-linux-server) | Private networks, full control | A server with SSH access |

Both serve the same static web app. Pick one.

## Prerequisites

- **Node.js** >= 20
- **pnpm** (`npm install -g pnpm`)
- **Git**
- (Cloudflare option) A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- (Linux option) A server with Nginx or Caddy and SSH access

## Step 1: Fork & Clone

Fork the repo on GitHub, then clone your fork:

```bash
git clone https://github.com/YOUR-ORG/seedr.git
cd seedr

# Set upstream so you can pull future updates
git remote add upstream https://github.com/danieldeusing/seedr.git
```

## Step 2: Install & Build

```bash
pnpm install
pnpm build
```

Verify the build worked:

```bash
open apps/web/dist/index.html   # macOS
# or
xdg-open apps/web/dist/index.html  # Linux
```

You should see the seedr web UI with all registry items listed.

## Step 3: Customize Your Registry

### How the registry works

Each item is defined by an `item.json` file inside `registry/<type>s/<slug>/`:

```
registry/
├── manifest.json              # Top-level index (auto-generated)
├── skills/
│   ├── manifest.json          # All skills (auto-generated)
│   └── pdf/
│       ├── item.json          # Source of truth for this item
│       └── SKILL.md           # Skill content
├── plugins/
│   ├── manifest.json          # All plugins (auto-generated)
│   └── superpowers/
│       └── item.json
└── hooks/
    ├── manifest.json
    └── pre-commit-lint/
        ├── item.json
        └── hook.md
```

The `item.json` files are the source of truth. The `manifest.json` files are generated from them.

### Give your fork its own registry directory

Do this before you add anything.

`registry/` belongs to upstream. Every item in it arrives by `git merge upstream/main`, and
anything you delete out of it turns every later merge into a conflict — see
[Step 8](#step-8-keeping-in-sync-with-upstream) for what that costs.

So leave `registry/` alone and name a directory of your own. Create `seedr.config.json` at the
repo root:

```json
{
  "registryDir": "registry-internal"
}
```

Upstream ships no `seedr.config.json`, so the file exists only in your fork and no merge can
touch it. `resolveRegistryDir()` in `packages/registry-ops/src/fsPaths.ts` is the single place
that answers "where is the registry", and it answers with exactly one directory: the one you
name *replaces* `registry/` rather than adding to it. With no config file it returns `registry/`
— `DEFAULT_REGISTRY_DIR` in `packages/registry-ops/src/paths.ts` — which is what upstream itself
resolves.

`registryDir` is one plain directory name and **must start with `registry`** — `registry-internal`,
`registry-acme`. It is joined onto the repo root, so slashes and `..` are rejected outright
(`registryDirName()`, same file). The prefix is required because `turbo.json` invalidates the build
cache from `registry*/**` and cannot read this file: a name outside that glob would leave Turbo
serving a stale build after you edit an item.

### Add your own items

Your items go under the directory you just named, in the same layout `registry/` uses: the type
name pluralized, then the slug — except `mcp` and `settings`, which are used as-is
(`typeDirName()` in `packages/registry-ops/src/paths.ts`).

```bash
mkdir -p registry-internal/skills/my-team-skill
```

Create `registry-internal/skills/my-team-skill/item.json`:

```json
{
  "slug": "my-team-skill",
  "name": "My Team Skill",
  "type": "skill",
  "description": "Internal skill for our team workflows.",
  "longDescription": "Handles our specific deployment pipeline, including staging validation, canary checks, and rollback procedures. Covers both Kubernetes and ECS targets.",
  "sourceType": "seedr",
  "compatibility": ["claude"],
  "scope": ["project"]
}
```

Add the content file (e.g., `registry-internal/skills/my-team-skill/SKILL.md`). You don't have
to pre-create the type folders or a `labels.json`: `pnpm compile` creates every type directory,
and an absent label catalogue reads as an empty one.

### Don't delete upstream's items

There is no supported way to delete them, and you don't need one. Once `registryDir` names your
directory, that directory *is* the registry — `registry/` becomes files in the tree that nothing
resolves to. Your instance lists your items and nothing else, and because you never modified
`registry/`, upstream can keep changing it forever without ever meeting your branch.

Two things happen if you try anyway:

- **`official` items refuse to go.** `packages/registry-ops/src/ops/remove.ts` throws
  `Official items cannot be removed: the next sync would restore <type> "<slug>"`. The nightly
  `sync.yml` rebuilds those items from `anthropics/skills` and
  `anthropics/claude-plugins-official`, so the deletion would return on the next run regardless.
- **Everything else you delete becomes a permanent merge conflict.** Deleting an item doesn't
  remove it upstream, only from your branch. Upstream then keeps editing a file you deleted, and
  git reports that disagreement on every pull from then on — one
  `CONFLICT (modify/delete)` per item, forever.

If you want a few of upstream's items in your own instance, **copy** the item's directory across.
Reading `registry/` is fine; writing to it is not:

```bash
cp -R registry/skills/pdf registry-internal/skills/pdf
```

### Rebuild manifests

After any registry changes, regenerate the manifest files:

```bash
pnpm compile
```

This reads all `item.json` files and produces the `manifest.json` index files. Rebuild the web app afterward to pick up the changes:

```bash
pnpm build
```

## Step 4: Configure the CLI

The CLI resolves registry content by trying a local path first, then falling back to a remote URL. Point it at your own instance with environment variables — no code change:

```bash
SEEDR_REGISTRY_URL=https://seedr.your-company.example/registry npx @your-scope/seedr list
SEEDR_REGISTRY_DIR=/path/to/your/seedr/registry-internal npx @your-scope/seedr add my-skill
```

Point `SEEDR_REGISTRY_DIR` at the directory you named in `seedr.config.json` (Step 3). It is
read straight from the environment and wins over whatever local directory the CLI would
otherwise resolve — see `REGISTRY_PATH` in `packages/cli/src/config/registry.ts`. The published
CLI ships only its `dist/`, so it has no checkout to read `seedr.config.json` from; the variable
is how you tell it.

To change the fork's *default* (so your users need no variable), edit `DEFAULT_REGISTRY_URL` in `packages/cli/src/config/registry.ts`.

If you're serving the registry from your own domain (e.g., via Nginx), you can point it there instead:

```typescript
const DEFAULT_REGISTRY_URL = "https://seedr.internal.yourcompany.com/registry";
```

### Rename the package (optional)

If you want your team to install via `npx @yourorg/seedr add`, change the package name in `packages/cli/package.json`:

```json
{
  "name": "@yourorg/seedr",
  ...
}
```

### Rebrand the instance

The codebase has several places that reference the upstream identity (author names, URLs, labels). Here's the full list of changes to make it yours.

**Author & display names** — The web UI shows an author on every item card and detail page. Update:

- `apps/web/src/components/ItemCard.tsx` — change the first-party author fallback to your company name
- `apps/web/src/routes/Detail.tsx` — same fallback for the detail page author
- `apps/web/src/routes/Home.tsx` — header subtitle and copy
- `apps/web/src/components/Header.tsx` — remove or replace icon links (GitHub, etc.)
- New items need no change: the add/update skills, Seedr Studio and `scripts/registry-op.ts identity` all derive the author and `externalUrl` from your clone's own git remote and `user.name`

**sourceType** (optional) — If you want to rename the first-party source type to your own identifier (e.g., `"acme"`), the vocabulary lives in one place:

- `packages/shared/` — the `SourceType` type definition
- `packages/registry-ops/src/sourceTypes.ts` — the canonical values, the deprecated aliases and the storage table that everything else imports
- `registry/*/*/item.json` — all existing items, rewritten with a migration like `scripts/migrate-source-types.ts`

Nothing else branches on the literal: the CLI, the web app and Seedr Studio all go through `isFirstParty()`.

**Install commands in the web UI** — The detail page shows `npx @danieldeusing/seedr add ...` commands. Update `apps/web/src/routes/Detail.tsx` to reference your package name and registry:

```typescript
// Before
npx @danieldeusing/seedr add ${item.slug}

// After (with private Verdaccio registry)
npx --registry https://your-registry-url @yourorg/seedr add ${item.slug}
```

**Hardcoded URLs** — Search for `seedr.danieldeusing.de` and replace with your instance URL in:
- `packages/cli/src/utils/ui.ts` — CLI banner
- `packages/cli/src/utils/analytics.ts` — analytics endpoint
- `packages/cli/src/commands/init.ts` — init command output
- `packages/cli/package.json` — `homepage` field

**Publish script** (optional) — Add a convenience script to the root `package.json` for rebuilding and publishing in one step:

```json
{
  "scripts": {
    "publish-local": "pnpm compile && npx turbo run build --force && cd packages/cli && npm publish --registry http://localhost:4873"
  }
}
```

## Step 5: Distribute the CLI

Pick the option that fits your team.

### Option A: GitHub Packages (private npm registry)

Publish to GitHub's built-in package registry. Good for teams already on GitHub.

1. Create a `.npmrc` in `packages/cli/`:

   ```
   @yourorg:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

2. Generate a GitHub personal access token with `write:packages` scope.

3. Publish:

   ```bash
   cd packages/cli
   pnpm build
   NODE_AUTH_TOKEN=ghp_your_token npm publish
   ```

4. Team members configure their `.npmrc` to pull from GitHub Packages:

   ```
   @yourorg:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=ghp_their_read_token
   ```

5. Install:

   ```bash
   npx @yourorg/seedr add
   ```

### Option B: Verdaccio (self-hosted npm registry)

Run your own npm registry. Good for air-gapped or fully private environments.

1. Install and start Verdaccio:

   ```bash
   npm install -g verdaccio
   verdaccio  # Starts on http://localhost:4873 by default
   ```

2. Create a user and authenticate:

   ```bash
   npm adduser --registry http://localhost:4873
   ```

   This stores an auth token in `~/.npmrc`.

3. Add `publishConfig` to `packages/cli/package.json`:

   ```json
   {
     "publishConfig": {
       "registry": "http://localhost:4873"
     }
   }
   ```

4. Publish:

   ```bash
   cd packages/cli
   pnpm build
   npm publish --registry http://localhost:4873
   ```

5. Team members install from Verdaccio:

   ```bash
   npx --registry http://your-server:4873 @yourorg/seedr add
   ```

**Autostart on macOS** — To keep Verdaccio running after reboots, create a launchd plist at `~/Library/LaunchAgents/dev.verdaccio.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>dev.verdaccio</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/verdaccio</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

Load it: `launchctl load ~/Library/LaunchAgents/dev.verdaccio.plist`

> **Note:** The `EnvironmentVariables > PATH` is required — launchd doesn't inherit your shell PATH, so Verdaccio won't find `node` without it.

**HTTPS via Caddy proxy** — Verdaccio runs on HTTP. To expose it over HTTPS (e.g., on a Tailscale network), add a reverse proxy block to your Caddyfile:

```
your-host:4874 {
    reverse_proxy localhost:4873
}
```

Team members then use `https://your-host:4874` as their registry URL. Caddy handles TLS automatically.

### Option C: Install directly from Git

No registry needed. Install straight from your repo.

```bash
npm install -g git+https://github.com/YOUR-ORG/seedr.git#main
seedr add
```

Or without global install:

```bash
npx git+https://github.com/YOUR-ORG/seedr.git add
```

> Note: This installs the full repo. For private repos, team members need Git access.

### Option D: Local build + npm link

Simplest option for small teams. Clone, build, and link locally.

```bash
git clone https://github.com/YOUR-ORG/seedr.git
cd seedr
pnpm install && pnpm build
cd packages/cli
npm link
```

Now `seedr` is available globally on that machine:

```bash
seedr add
```

## Step 6a: Deploy to Cloudflare Pages

### Create a Pages project

1. Install Wrangler:

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Create the project and deploy:

   ```bash
   wrangler pages project create my-seedr --production-branch=main
   cd apps/web && wrangler pages deploy --commit-dirty=true
   ```

   Your site is now live at `https://my-seedr.pages.dev`.

### Set up analytics with D1 (optional)

The web app can track install counts using Cloudflare D1.

1. Create a D1 database:

   ```bash
   wrangler d1 create my-seedr-analytics
   ```

2. Note the `database_id` from the output and update `apps/web/wrangler.toml`:

   ```toml
   name = "my-seedr"
   pages_build_output_dir = "dist"
   compatibility_date = "2024-12-01"

   [[d1_databases]]
   binding = "DB"
   database_name = "my-seedr-analytics"
   database_id = "your-database-id-here"
   ```

3. Initialize the schema:

   ```bash
   wrangler d1 execute my-seedr-analytics --file=apps/web/schema.sql
   ```

### Custom domain

1. Go to your Cloudflare dashboard > Pages > your project > Custom domains.
2. Add your domain (e.g., `seedr.yourcompany.com`).
3. If the domain is on Cloudflare, DNS is configured automatically. Otherwise, add the CNAME record shown.

## Step 6b: Deploy to a Linux Server

Build the web app and serve it as a static site.

### Build

```bash
pnpm install && pnpm build
```

The built files are in `apps/web/dist/`. The registry JSON files are in your registry directory
— `registry/`, or whatever `seedr.config.json` names (Step 3). The server blocks below say
`registry/`; point them at your own directory instead. Keep the public URL path as `/registry/`:
the CLI derives the repository root from its registry URL by stripping that trailing segment
(`REGISTRY_ROOT_URL` in `packages/cli/src/config/registry.ts`).

### Nginx

Install Nginx and create a site config:

```nginx
# /etc/nginx/sites-available/seedr
server {
    listen 80;
    server_name seedr.yourcompany.com;

    # Serve the web app
    root /var/www/seedr/apps/web/dist;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Serve registry files with correct content type
    location /registry/ {
        alias /var/www/seedr/registry/;
        default_type application/json;
        add_header Access-Control-Allow-Origin *;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/seedr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Caddy

If you prefer Caddy (automatic HTTPS):

```
# /etc/caddy/Caddyfile
seedr.yourcompany.com {
    root * /var/www/seedr/apps/web/dist
    file_server

    # Registry files — MUST come before the SPA fallback
    handle_path /registry/* {
        root * /var/www/seedr/registry
        file_server
        header Access-Control-Allow-Origin *
    }

    # SPA fallback — wrap in handle {} so it doesn't catch /registry/*
    handle {
        try_files {path} /index.html
        file_server
    }
}
```

> **Gotcha:** If `try_files` is at the top level (not inside `handle {}`), it catches `/registry/*` requests and returns `index.html` instead of JSON files. Always put the `/registry/` handler first and wrap the SPA fallback in its own `handle {}` block.

```bash
sudo systemctl reload caddy
```

### SSL with Let's Encrypt (Nginx)

Caddy handles SSL automatically. For Nginx, use certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seedr.yourcompany.com
```

Certbot modifies your Nginx config to add SSL and sets up auto-renewal.

## Step 7: CI/CD (Optional)

The upstream repo ships three workflows built on one shared validation pipeline — see
[`release-process.md`](release-process.md) for the full description:

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `validate.yml` | called by the others | lint, typecheck, all test suites, build, registry gates, dependency audit, browser tests |
| `ci.yml` | push to `main`, PRs | validation only |
| `sync.yml` | nightly / manual | re-syncs upstream items on a candidate branch, validates it, then promotes to `main` and `prod` |
| `deploy.yml` | push to `prod` / manual | validates, deploys the web app to Cloudflare Pages, publishes the CLI (version committed and tagged *before* publishing) |

To adapt them for your fork:

1. Keep `validate.yml` and `ci.yml` as they are.
2. In `deploy.yml`, set repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`,
   create the GitHub environment `production` (add reviewers if you want a manual gate), and
   remove the `publish-cli` job unless you publish your own package (which needs npm trusted
   publishing configured for your repository).
3. In `sync.yml`, keep it only if you want to pull upstream community/official items
   automatically; set the repository variables `NOTIFY_EMAIL` and `SITE_URL` and the `SMTP_*`
   secrets for the notification email, or delete the `notify` job. The sync fails closed: a
   source that cannot be read is carried over unchanged, and more than `SYNC_MAX_DELETIONS`
   (default 5) removals abort the run.

## Step 8: Keeping in Sync with Upstream

Pull updates from the upstream seedr repo:

```bash
git fetch upstream
git merge upstream/main
```

**What to expect:**

- Your own registry directory never conflicts. Upstream has no directory by that name, so the merge has nothing to reconcile it against.
- If upstream adds new items, they appear as new directories under `registry/` — no conflict.
- If you've modified `registry.ts` (Step 4), you'll get a conflict there. Resolve by keeping your URL.
- Manifest files (`manifest.json`) are auto-generated, so run `pnpm compile` after merging to regenerate them.

That first point holds only because you kept your items out of `registry/`. Skip Step 3 and this
step stops working — permanently.

> **Why Step 3 is not optional.** A private fork once deleted upstream's public items to keep a
> registry of only its own. Every merge after that produced one
> `CONFLICT (modify/delete): ... deleted in HEAD and modified in upstream/main` per item:
> **110 conflicts, 108 of them in `registry/`**, with only `CLAUDE.md` and `pnpm-lock.yaml`
> worth a human's attention. Merging cost more than it was worth, so it stopped happening, and
> the fork drifted **89 commits behind**.
>
> The stale code was not the damage. Stale code just sits there. The damage was the stale
> *instructions*: the fork's frozen copy of `.claude/skills/` still held an `add-toolr` skill
> telling a coding agent to write `sourceType: "toolr"` — a value this repo had since replaced
> with `seedr`. An agent read it and did as it was told, and the item it produced failed
> validation, because `packages/registry-ops/src/validate.ts` accepts only the three values in
> `CANONICAL_SOURCE_TYPES` (`official`, `seedr`, `community`). A stale copy of code is dead
> weight. A stale copy of an instruction gets followed.

## Step 9: Private Network Considerations

If your seedr instance is on a private network (VPN, internal network), no authentication is needed — network access is the boundary.

**If you need authentication** (public-facing instance):

- **Reverse proxy auth**: Add HTTP basic auth or OAuth2 proxy in front of Nginx/Caddy.
- **Cloudflare Access**: If using Cloudflare Pages, enable [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/) to gate the site behind SSO.
- **VPN**: Restrict access to users on your corporate VPN.

The web app is fully static — any standard web auth approach works.

## Appendix

### Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `SEEDR_REGISTRY_DIR` | CLI environment | Local registry directory to read first; wins over the directory the CLI resolves on its own |
| `SEEDR_REGISTRY_URL` | CLI environment | Remote registry URL; the fallback when the local directory has no answer |
| `DEFAULT_REGISTRY_URL` | `packages/cli/src/config/registry.ts` | The fork's built-in remote registry URL (a constant, not an env var) |
| `CLOUDFLARE_API_TOKEN` | CI secrets | Cloudflare Pages deployment |
| `CLOUDFLARE_ACCOUNT_ID` | CI secrets | Cloudflare Pages deployment |
| `GITHUB_TOKEN` | CI secrets | Build and sync workflows |
| `NODE_AUTH_TOKEN` | CI / local | npm publish authentication |

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `pnpm build` fails | Run `pnpm clean` then `pnpm install && pnpm build` |
| Build seems stale after registry changes | `pnpm clean` does NOT clear Turbo's cache. Use `npx turbo run build --force` to bypass it. |
| CLI can't find items | Check `SEEDR_REGISTRY_URL` (or `DEFAULT_REGISTRY_URL`) points to your registry. Verify `manifest.json` exists at that URL. |
| CLI or web app lists upstream's items, not yours | `seedr.config.json` is missing, or `registryDir` names a directory that doesn't exist. Without it the registry is `registry/` (see [Step 3](#give-your-fork-its-own-registry-directory)). |
| Web app shows empty list | Run `pnpm compile` to regenerate manifests, then `pnpm build` |
| Nginx returns 404 for routes | Add `try_files $uri $uri/ /index.html;` for SPA fallback |
| CORS errors loading registry | Add `Access-Control-Allow-Origin *` header to the `/registry/` location |
| Caddy serves `index.html` for `/registry/` URLs | Wrap SPA `try_files` in a `handle {}` block and put `/registry/` handler before it (see [Caddy section](#caddy)) |
| Verdaccio won't start via launchd | Add `PATH` to `EnvironmentVariables` in the plist — launchd doesn't inherit your shell PATH |

### File structure cheat sheet

```
seedr/
├── apps/web/                    # React web app
│   ├── dist/                    # Built static files (serve this)
│   ├── wrangler.toml            # Cloudflare Pages config
│   └── schema.sql               # D1 analytics schema
├── packages/cli/                # CLI package
│   └── src/config/registry.ts   # ← Change DEFAULT_REGISTRY_URL here
├── seedr.config.json            # ← Your fork adds this; upstream has no such file
├── registry/                    # Upstream's registry — never edit it in a fork
│   ├── manifest.json            # Top-level index
│   ├── skills/                  # Skill items + manifest
│   ├── plugins/                 # Plugin items + manifest
│   ├── hooks/                   # Hook items + manifest
│   └── ...
├── registry-internal/           # Your registry, named by seedr.config.json (serve at /registry/)
└── turbo.json                   # Build orchestration
```
