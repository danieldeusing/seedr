import type { ShotSlot } from './shots'

/** The Studio tour's shots: captures and crops in `promo/assets/` (docs/promo-video.md §2). */
export const STUDIO_SLOTS: ShotSlot[] = [
  {
    file: 'studio-01-detail.png',
    index: '01',
    title: 'browse',
    lines: [
      'Seedr Studio opens a seedr checkout: every capability by type, its metadata and a preview of each file.',
      'A pencil marks the items you can edit; the sync owns the rest. The icons are the agents each supports.',
    ],
  },
  {
    file: 'studio-02-add.png',
    index: '02',
    title: 'add',
    lines: [
      'Add a capability from a local folder or a git repository, or let the agent write it from a prompt.',
      'A folder is copied in by a transaction; a repository or a prompt goes to the coding agent.',
    ],
  },
  {
    file: 'studio-03-test-install.png',
    index: '03',
    title: 'test install',
    lines: [
      'Test install runs the real CLI in a scratch folder and lists every file it wrote.',
      'For a skill, it checks that each file arrived byte for byte.',
    ],
  },
  {
    file: 'studio-04-publish.png',
    index: '04',
    title: 'publish',
    lines: [
      'Publish hands the commit to an agent that may read and edit files and run git, nothing else.',
      'A branch whose push starts a workflow is marked; for prod, the warning names deploy.yml.',
    ],
  },
]
