import { getStaticFiles, staticFile } from 'remotion'

/**
 * One entry per screenshot slot. The files land in `promo/assets/` and none of
 * them is required — see `presentShots()`.
 */
export interface ShotSlot {
  /** Filename inside `promo/assets/`. */
  file: string
  /** The `NN` marker drawn beside the scene title. */
  index: string
  title: string
  /** One complete sentence per entry — they are set as separate paragraphs. */
  lines: string[]
}

export const SHOT_SLOTS: ShotSlot[] = [
  {
    file: '01-home.png',
    index: '01',
    title: 'the registry',
    lines: [
      'One curated registry: skills, hooks, agents, plugins, commands and MCP servers.',
      'Quality over quantity — official capabilities, first-party work, vetted community picks.',
    ],
  },
  {
    file: '02-skills.png',
    index: '02',
    title: 'browse',
    lines: [
      'Every card names its author and its source — official, community or seedr.',
      'The icons on each card are the coding agents it installs into.',
    ],
  },
  {
    file: '03-skill-detail.png',
    index: '03',
    title: 'one capability',
    lines: [
      'Open one: what it does, a tl;dr of every script it ships, and the file tree behind it.',
      'The install command sits right there — copy it, or read the source first.',
    ],
  },
  {
    file: '04-plugins.png',
    index: '04',
    title: 'plugins',
    lines: [
      'Whole plugins too — 66 of them, from single-skill wrappers to full packages.',
      'Each card says what is inside before you install any of it.',
    ],
  },
]

export interface ResolvedShot extends ShotSlot {
  /** A `staticFile()` URL, only ever set for a file that is really there. */
  src: string
}

/**
 * The slots whose file is present in `assets/`, in declaration order.
 *
 * A filter rather than a fallback on purpose: a slot with no file produces no
 * scene, so three screenshots render a three-screenshot video and zero render
 * the titles alone. Nothing ever points `<Img>` at a URL that 404s, which
 * Remotion treats as a render error, not an empty box.
 */
export function presentShots(): ResolvedShot[] {
  const onDisk = new Map(getStaticFiles().map((f) => [f.name, f]))

  return SHOT_SLOTS.flatMap((slot) => {
    const file = onDisk.get(slot.file)
    if (!file || file.sizeInBytes === 0) {
      return []
    }
    return [{ ...slot, src: staticFile(slot.file) }]
  })
}
