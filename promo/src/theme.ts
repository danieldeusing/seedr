/**
 * The `warm` theme, copied out of the app's own `apps/web/src/styles/index.css`
 * (and the estate's `@danieldeusing/design/tokens.css`, which it imports).
 *
 * These are literals rather than CSS variables on purpose: Remotion renders in
 * a headless Chrome that never loads the app's stylesheet, so there is nothing
 * for a `var()` to resolve against. The trade is that this file is a copy, so
 * the comment beside every value names the token it came from — when the app
 * repaints, this is the one file to reconcile.
 */
export const theme = {
  /** --background */
  ground: '#f5efe2',
  /** the shade under the window chrome */
  groundAlt: '#f1e9d8',
  /** --card */
  card: '#efe7d4',
  /** --muted · --secondary */
  panel: '#ece3cf',
  /** --border · --input */
  border: '#d9cdb6',
  /** a hairline quieter than --border */
  borderSoft: '#e0d5bf',
  /** --muted-foreground */
  muted: '#71614e',
  /** --foreground · --card-foreground */
  ink: '#43352a',
  /** the app's emphasis ink */
  inkStrong: '#241a12',
  /** --primary · --accent · --ring — the burnt orange */
  accent: '#8a4516',
  /** the accent one step further from the ground */
  accentDeep: '#5c2d0e',
  /** the accent as a fill that emphasis ink sits on */
  accentSoft: '#e6cdb1',
  /** --primary-foreground */
  onAccent: '#f8f3e8',
  /** --success, warm value — the CLI scene's ✔ lines */
  success: '#1a6b2e',
} as const

/**
 * Capability-type hues: seedr's own badge palette, the light-theme values from
 * `:root` in `apps/web/src/styles/index.css` (`--badge-*`). A type's colour is
 * information in this app, so the promo uses the app's own coding rather than
 * picking decorative hues.
 */
export const typeHue = {
  /** --badge-pink */
  skill: '#be185d',
  /** --badge-purple */
  hook: '#7e22ce',
  /** --badge-blue */
  agent: '#1d4ed8',
  /** --badge-indigo */
  plugin: '#4338ca',
  /** --badge-amber */
  command: '#b45309',
  /** --badge-orange */
  settings: '#c2410c',
  /** --badge-teal */
  mcp: '#0f766e',
} as const

/** The estate ships exactly one text size and three heading steps; these are the video's. */
export const type = {
  mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
  hero: 92,
  title: 56,
  section: 34,
  body: 27,
  meta: 21,
  /** terminal output in the CLI scene — smaller than body, still legible at 1920 */
  term: 23,
} as const
