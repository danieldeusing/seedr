---
paths:
  - turbo.json
  - pnpm-workspace.yaml
  - package.json
---

# Turbo Monorepo Conventions

## Task Configuration

Tasks are defined in `turbo.json`:

| Task | Description | Caching |
|------|-------------|---------|
| `build` | Compile TypeScript, bundle | Yes |
| `dev` | Development servers | No (persistent) |
| `lint` | ESLint/type checking | Yes |
| `typecheck` | TypeScript validation | Yes |
| `clean` | Remove build artifacts | No |

## Running Commands

```bash
# Run task for all packages
pnpm build
pnpm lint

# Run task for specific package
pnpm --filter @seedr/cli build
pnpm --filter @seedr/web dev

# Run from package directory
cd packages/cli && pnpm build
```

## Task Dependencies

```json
{
  "build": {
    "dependsOn": ["^build"],  // Build dependencies first
    "outputs": ["dist/**"]
  }
}
```

- `^build` means "build dependencies before this package"
- `outputs` defines what to cache

## Adding New Packages

1. Create directory in `packages/` or `apps/`
2. Add `package.json` with unique name (e.g., `@seedr/new-pkg`)
3. Add `tsconfig.json` extending `../../tsconfig.base.json`
4. Run `pnpm install` to link workspace

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| `npm install` | Use `pnpm install` |
| Relative imports across packages | Use workspace dependencies |
| Manually running builds in order | Let turbo handle task ordering |
| Duplicating dependencies | Add to root for shared deps |
