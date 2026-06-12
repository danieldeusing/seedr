---
paths:
  - apps/web/src/**/*.tsx
  - apps/web/src/**/*.ts
---

# Web App Patterns

## Route Structure

Routes live in `src/routes/`:

| Route | Path | Purpose |
|-------|------|---------|
| Home | `/` | Landing page with featured items |
| Browse | `/:type` | Search and filter items of one type (e.g. `/skills`) |
| Detail | `/:type/:slug` | Individual item details |
| Privacy / Impressum | `/privacy`, `/impressum` | Static legal pages |

## Component Organization

```
src/
├── components/
│   ├── ui/              # Local shadcn-style primitives (Button, Badge, Tooltip, DropdownMenu, ...)
│   ├── Header.tsx       # App-specific components
│   ├── StatusBar.tsx    # Bottom terminal bar with theme switcher
│   └── ItemCard.tsx
├── routes/              # Page components
├── contexts/            # React contexts (NavigationContext)
└── lib/                 # Utilities and types (cn() in lib/utils.ts)
```

## UI Components

Local shadcn-style primitives in `src/components/ui/` (no external design-system package):

```typescript
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"

<Button variant="outline" size="sm">Install</Button>
<Badge variant="secondary">Claude</Badge>
```

Theming: four themes (warm/green/mono/paper) via CSS variables and `html[data-theme]`, defined in `src/styles/index.css`. Use semantic classes (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-primary`); never hardcode colors. Border radius is globally zero (terminal aesthetic).

## Registry Integration

```typescript
import { fetchManifest, fetchItemContent } from '@/lib/registry'

// In route component
const manifest = await fetchManifest()
const skills = manifest.skills
```

## Tailwind Styling

- Use Tailwind classes directly
- Tokens and custom utilities live in `src/styles/index.css` (Tailwind 4, no config file)
- Keep component-specific styles in component files

## React Router

```typescript
import { useParams, Link } from 'react-router-dom'

// Get route params
const { type, slug } = useParams()

// Navigation
<Link to={`/skills/${skill.slug}`}>View</Link>
```

## Plugin Classification in Type Views

Plugins have two classification types that determine where they appear in the UI:

- **`wrapper`**: Wraps a single capability type (e.g., `wrapper: "skill"`). These ARE cross-listed on capability type pages because they're essentially that type packaged as a plugin.
- **`package`**: Contains multiple content types (e.g., `package: { skill: 1, mcp: 1 }`). These are NOT cross-listed — they only appear on the plugins page.

Only wrapper plugins should be included in `getItemsByType()`, `getTypeCount()`, and `getTypeCounts()` for non-plugin types. If upstream reclassifies a plugin from wrapper to package (e.g., by adding `.mcp.json`), it correctly disappears from capability type views.

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Inline styles | Use Tailwind classes |
| Fetch in render | Use loader or useEffect |
| Prop drilling | Keep state close to usage |
| Giant components | Extract to smaller components |
