# CLAUDE.md Templates

Templates for different project types. Use as starting points, not copy-paste.

---

## Key Principles

- **Concise**: One line per concept when possible
- **Actionable**: Commands must be copy-paste ready
- **Project-specific**: Document YOUR patterns, not generic advice
- **Current**: All info must reflect actual codebase state

---

## Template: Minimal (Any Project)

Best for small projects or getting started.

```markdown
# <Project Name>

<One-line description>

## Commands

| Command | Description |
|---------|-------------|
| `<install>` | Install dependencies |
| `<dev>` | Start development |
| `<build>` | Production build |
| `<test>` | Run tests |

## Architecture

```
<root>/
  <dir>/    # <purpose>
  <dir>/    # <purpose>
```

## Gotchas

- <non-obvious thing>
```

---

## Template: Standard Project

For most single-package projects.

```markdown
# <Project Name>

<One-line description>

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm test` | Run test suite |
| `npm run lint` | Lint and format |

## Architecture

```
src/
  components/  # UI components
  services/    # Business logic
  utils/       # Shared utilities
tests/
  unit/        # Unit tests
  e2e/         # End-to-end tests
```

## Key Files

- `src/index.ts` — Application entry point
- `src/config.ts` — Configuration management
- `.env.example` — Required environment variables

## Code Style

- TypeScript strict mode enabled
- Prefer `const` over `let`
- Use named exports over default

## Gotchas

- <specific to your project>
- <common mistake to avoid>
```

---

## Template: Monorepo

For workspaces with multiple packages.

```markdown
# <Monorepo Name>

<Description>

## Packages

| Package | Description | Path |
|---------|-------------|------|
| `@scope/core` | Core library | `packages/core` |
| `@scope/api` | API server | `packages/api` |
| `@scope/web` | Web frontend | `packages/web` |

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm run build` | Build all packages |
| `npm run dev` | Start all in dev mode |
| `npm run test` | Test all packages |
| `npm run build -w @scope/core` | Build specific package |

## Cross-Package Patterns

- Shared types in `packages/shared/types`
- All packages import from `@scope/*` (not relative paths)
- Build order: core → shared → api/web

## Gotchas

- Must build `core` before `api` (dependency)
- Run `npm install` from root, not package dirs
```

---

## Template: Package/Module

For individual packages within a monorepo.

```markdown
# <Package Name>

<Purpose of this package>

## Usage

```typescript
import { Thing } from '@scope/package';
```

## Key Exports

- `Thing` — Main export, does X
- `createThing()` — Factory function
- `ThingConfig` — Configuration type

## Internal Notes

- <implementation detail Claude should know>
- <dependency on other packages>
```

---

## Template: Backend/API

For API servers and backend services.

```markdown
# <API Name>

<One-line description>

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run db:migrate` | Run migrations |
| `npm run db:seed` | Seed test data |

## Architecture

```
src/
  routes/      # API endpoint handlers
  services/    # Business logic
  models/      # Database models
  middleware/  # Express middleware
  utils/       # Shared utilities
```

## API Patterns

- All endpoints return JSON
- Errors use standard format: `{ error: string, code: string }`
- Auth via `Authorization: Bearer <token>` header

## Database

- PostgreSQL with Prisma ORM
- Migrations in `prisma/migrations/`
- `npm run db:studio` — Open Prisma Studio

## Environment

Required in `.env`:
- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — Token signing secret
- `PORT` — Server port (default: 3000)

## Gotchas

- <specific to your project>
```

---

## Template: Frontend/React

For React/Next.js applications.

```markdown
# <App Name>

<One-line description>

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on localhost:3000 |
| `npm run build` | Production build |
| `npm run lint` | Lint and type check |
| `npm test` | Run tests |

## Architecture

```
src/
  app/           # Next.js app router pages
  components/    # Reusable UI components
  features/      # Feature-specific modules
  hooks/         # Custom React hooks
  lib/           # Utilities and helpers
  stores/        # State management
```

## Component Patterns

- Use `components/ui/` for primitive components
- Feature components in `features/<name>/components/`
- Prefer composition over prop drilling

## State Management

- Zustand for global state
- React Query for server state
- Local state for component-specific

## Styling

- Tailwind CSS for utility classes
- CSS modules for complex components
- No inline styles

## Gotchas

- <specific to your project>
```

---

## Template: CLI Tool

For command-line applications.

```markdown
# <CLI Name>

<One-line description>

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm link` | Install globally for testing |
| `npm test` | Run tests |

## Usage

```bash
<cli-name> <command> [options]

# Examples
<cli-name> init --template react
<cli-name> build --watch
```

## Architecture

```
src/
  commands/    # Command implementations
  utils/       # Shared utilities
  index.ts     # Entry point, CLI setup
```

## Adding a Command

1. Create `src/commands/<name>.ts`
2. Export command config with name, description, action
3. Register in `src/index.ts`

## Gotchas

- <specific to your project>
```

---

## Rules File Templates

### security.md

```markdown
# Security Rules

## Secrets
- NEVER commit API keys, tokens, or passwords
- Use `.env.local` for local secrets (gitignored)
- Access secrets via `process.env` only

## Input Validation
- Validate all user input at API boundaries
- Use parameterized queries (no string concatenation)
- Sanitize data before rendering (XSS prevention)

## Authentication
- All API endpoints require auth except `/health`, `/login`
- Check permissions before data access
- Log authentication failures
```

### testing.md

```markdown
# Testing Rules

## Requirements
- All new features need tests before merge
- Minimum 80% coverage for changed files
- E2E tests for user-facing flows

## Patterns
- Use factories in `tests/factories/` for test data
- Prefer integration tests over excessive unit tests
- Mock external services, not internal modules

## Commands
- `npm test` — Full suite
- `npm test -- --watch` — Watch mode
- `npm test -- --coverage` — With coverage report
```

### code-style.md

```markdown
# Code Style

## TypeScript
- Strict mode enabled, no `any`
- Prefer `interface` over `type` for objects
- Use `const` by default, `let` only when needed

## Naming
- Components: PascalCase (`UserProfile`)
- Functions/variables: camelCase (`getUserData`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_RETRIES`)
- Files: kebab-case (`user-profile.tsx`)

## Imports
- External packages first, then internal
- Use absolute imports (`@/components/...`)
- No circular dependencies
```
