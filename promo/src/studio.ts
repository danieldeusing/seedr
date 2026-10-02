import type { ShotSlot } from './shots'

/** The Studio tour's shots: crops in `promo/assets/` (docs/promo-video.md §2). */
export const STUDIO_SLOTS: ShotSlot[] = [
  {
    file: 'studio-01-explorer.png',
    index: '01',
    title: 'the explorer',
    lines: [
      'Seedr Studio opens a seedr checkout as an explorer, every capability grouped by type.',
      'A pencil marks what you can edit; an eye marks what the daily sync owns.',
    ],
  },
  {
    file: 'studio-02-detail.png',
    index: '02',
    title: 'one capability',
    lines: [
      'Open one: its metadata beside a read-only preview of every file it ships.',
      'Syntax, formatted markdown or plain text, the same views as the website.',
    ],
  },
  {
    file: 'studio-03-add.png',
    index: '03',
    title: 'add',
    lines: [
      'Add a capability from a local folder, a git repository, or a prompt for an agent.',
      'Every field says who fills it in: you, or the agent.',
    ],
  },
  {
    file: 'studio-04-test-install.png',
    index: '04',
    title: 'test install',
    lines: [
      'Test install runs the real CLI in a scratch folder and lists every file it wrote.',
      'For a skill, it checks that each file arrived byte for byte.',
    ],
  },
  {
    file: 'studio-05-publish.png',
    index: '05',
    title: 'publish',
    lines: [
      'Publish hands the commit to an agent allowed git and file edits, nothing else.',
      'A branch whose push starts a workflow is marked, so prod says that it deploys.',
    ],
  },
]
