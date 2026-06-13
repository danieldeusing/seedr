# Scheduler & CI/CD Workflows

Seedr uses GitHub Actions to automatically sync content from upstream sources and deploy updates.

## Workflows

### 1. Sync Registry (`sync.yml`)

**Trigger:** Daily at 6:00 UTC + manual dispatch

**Purpose:** Fetches skills and plugins from upstream sources and re-syncs community items from their GitHub repos.

**Sources:**
- `anthropics/skills` → Official skills (all AI tools)
- `anthropics/claude-plugins-official/plugins` → Official plugins (Claude only)
- `anthropics/claude-plugins-official/external_plugins` → Community plugins (Claude only)
- Manually-added community items → Re-fetched from their `externalUrl` GitHub repos

**Flow:**
```
Schedule (6:00 UTC) or Manual Trigger
            ↓
    Fetch from Anthropic repos
            ↓
    Re-sync community items from their GitHub repos
    (updates metadata, file trees, last commit dates)
            ↓
    Merge: toolr items + community items + Anthropic items
            ↓
    Update registry/manifest.json
            ↓
    If changes detected:
      → Commit to main
      → Push to main AND prod
```

**Item ordering in manifest:**
1. Toolr items (manually maintained, always preserved)
2. Community items (manually added via `/add-community`, re-synced from GitHub)
3. Anthropic items (synced from Anthropic repos)

### 2. Deploy (`deploy.yml`)

**Trigger:** Push to `prod` branch + manual dispatch

**Purpose:** Deploys web app to Cloudflare Pages and publishes CLI to npm.

**Flow:**
```
Push to prod
     ↓
┌────────────────────────────────────┐
│ Job 1: Deploy Web                  │
│   → Build all packages             │
│   → Deploy to Cloudflare Pages     │
└────────────────────────────────────┘
     ↓
┌────────────────────────────────────┐
│ Job 2: Publish CLI                 │
│   → Check for changes in:          │
│     - packages/cli/**              │
│     - registry/**                  │
│   → If changes since last release: │
│     - Bump patch version           │
│     - Commit version bump          │
│     - Publish to npm               │
└────────────────────────────────────┘
```

## Automatic Version Bumping

The CLI version is automatically bumped when:

1. **CLI code changes** - Any file in `packages/cli/` modified
2. **Registry changes** - `registry/manifest.json` updated (e.g., new skills from Anthropic)

Version bump logic:
- Compares current `package.json` version with npm
- If already different → publish without bumping (manual bump detected)
- If same → check for file changes since last version commit
- If changes exist → bump patch version (0.1.3 → 0.1.4)

## End-to-End Flow

When Anthropic adds a new skill or a community plugin is updated:

```
1. Daily sync runs at 6:00 UTC
        ↓
2. Fetches new/updated items from Anthropic repos
        ↓
3. Re-syncs community items from their GitHub repos
   (refreshes metadata, file trees, commit dates)
        ↓
4. Updates registry/manifest.json
        ↓
5. Commits: "chore: sync registry from Anthropic"
        ↓
6. Pushes to main AND prod
        ↓
7. Push to prod triggers deploy.yml
        ↓
8. Deploy detects registry/ changed
        ↓
9. Bumps CLI version (0.1.4 → 0.1.5)
        ↓
10. Commits: "chore(cli): bump version to 0.1.5 [skip ci]"
        ↓
11. Publishes @danieldeusing/seedr@0.1.5 to npm
        ↓
12. Users get new/updated items via: npx @danieldeusing/seedr add <name>
```

## Manual Triggers

Both workflows can be triggered manually from GitHub Actions:

- **Sync:** Actions → Sync Registry → Run workflow
- **Deploy:** Actions → Deploy → Run workflow

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/sync.yml` | Registry sync workflow |
| `.github/workflows/deploy.yml` | Deploy + publish workflow |
| `scripts/sync.ts` | Main sync orchestrator |
| `scripts/sync/anthropic.ts` | Anthropic-specific fetch logic |
| `scripts/sync/community.ts` | Community item re-sync logic |
| `scripts/sync/types.ts` | Shared types for sync scripts |
| `scripts/sync/utils.ts` | Shared utilities (GitHub API, file trees) |
| `registry/*/*/item.json` | Per-item source of truth (editable) |
| `registry/manifest.json` | Generated registry index (compiled from `item.json` files) |
