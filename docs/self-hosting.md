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

### Remove items you don't want

Delete the item's directory:

```bash
rm -rf registry/skills/some-skill-you-dont-need
```

### Add your own items

Place your content in the appropriate directory and create an `item.json`:

```bash
mkdir -p registry/skills/my-team-skill
```

Create `registry/skills/my-team-skill/item.json`:

```json
{
  "slug": "my-team-skill",
  "name": "My Team Skill",
  "type": "skill",
  "description": "Internal skill for our team workflows.",
  "longDescription": "Handles our specific deployment pipeline, including staging validation, canary checks, and rollback procedures. Covers both Kubernetes and ECS targets.",
  "sourceType": "toolr",
  "compatibility": ["claude"],
  "scope": ["project"]
}
```

Add the content file (e.g., `registry/skills/my-team-skill/SKILL.md`).

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

The CLI resolves registry content by trying a local path first, then falling back to a remote URL. To point it at your own instance, edit the `GITHUB_RAW_URL` constant in `packages/cli/src/config/registry.ts`:

```typescript
// Change this to your own raw content URL
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/YOUR-ORG/seedr/main/registry";
```

If you're serving the registry from your own domain (e.g., via Nginx), you can point it there instead:

```typescript
const GITHUB_RAW_URL = "https://seedr.internal.yourcompany.com/registry";
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

- `apps/web/src/components/ItemCard.tsx` — change the `sourceType === "toolr"` fallback to your company name
- `apps/web/src/routes/Detail.tsx` — same fallback for the detail page author
- `apps/web/src/routes/Home.tsx` — header subtitle and copy
- `apps/web/src/components/Header.tsx` — remove or replace icon links (Toolr, GitHub, etc.)
- `.claude/skills/add-toolr/SKILL.md` — update the `author` field in the item.json template so new items get your metadata

**sourceType** (optional) — If you want to rename `"toolr"` to your own identifier (e.g., `"acme"`), search-and-replace across:

- `packages/shared/` — the `SourceType` type definition
- `packages/cli/src/config/registry.ts` — routing logic for item content
- `apps/web/` — filters, badges, components that check `sourceType`
- `scripts/compile-manifest.ts` — manifest compilation
- `.claude/skills/` — add-toolr and remove-toolr skill templates
- `registry/*/*/item.json` — all existing items with `"sourceType": "toolr"`

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

The built files are in `apps/web/dist/`. The registry JSON files are in `registry/`.

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

The upstream repo has two workflows you can adapt:

### Deploy workflow (`.github/workflows/deploy.yml`)

Triggers on push to `prod`. Builds the app and deploys to Cloudflare Pages, then publishes the CLI to npm. To adapt:

1. Copy the workflow to your fork.
2. Set repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
3. Remove the `publish-cli` job if you don't publish to npm.
4. Change the branch trigger if you use a different deployment branch.

### Sync workflow (`.github/workflows/sync.yml`)

Runs daily to sync community items from their GitHub repos. To adapt:

1. Keep it if you want to pull upstream community items automatically.
2. Remove or disable it if your registry is fully self-managed.
3. Adjust the cron schedule (`0 6 * * *` = daily at 6:00 UTC) to your preference.

See [docs/scheduler/README.md](scheduler/README.md) for details on the sync mechanism.

## Step 8: Keeping in Sync with Upstream

Pull updates from the upstream seedr repo:

```bash
git fetch upstream
git merge upstream/main
```

**What to expect:**

- Conflicts are rare. Your custom `item.json` files live in separate directories from upstream items.
- If upstream adds new items, they appear as new directories — no conflict.
- If you've modified `registry.ts` (Step 4), you'll get a conflict there. Resolve by keeping your URL.
- Manifest files (`manifest.json`) are auto-generated, so run `pnpm compile` after merging to regenerate them.

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
| `GITHUB_RAW_URL` | `packages/cli/src/config/registry.ts` | Remote registry URL (hardcoded constant, not env var) |
| `CLOUDFLARE_API_TOKEN` | CI secrets | Cloudflare Pages deployment |
| `CLOUDFLARE_ACCOUNT_ID` | CI secrets | Cloudflare Pages deployment |
| `GITHUB_TOKEN` | CI secrets | Build and sync workflows |
| `NODE_AUTH_TOKEN` | CI / local | npm publish authentication |

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `pnpm build` fails | Run `pnpm clean` then `pnpm install && pnpm build` |
| Build seems stale after registry changes | `pnpm clean` does NOT clear Turbo's cache. Use `npx turbo run build --force` to bypass it. |
| CLI can't find items | Check `GITHUB_RAW_URL` points to your registry. Verify `manifest.json` exists at that URL. |
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
│   └── src/config/registry.ts   # ← Change GITHUB_RAW_URL here
├── registry/                    # Registry data (serve at /registry/)
│   ├── manifest.json            # Top-level index
│   ├── skills/                  # Skill items + manifest
│   ├── plugins/                 # Plugin items + manifest
│   ├── hooks/                   # Hook items + manifest
│   └── ...
└── turbo.json                   # Build orchestration
```
