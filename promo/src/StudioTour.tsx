import React from 'react'

import { Sequence } from 'remotion'

import { Ground } from './chrome'
import { Intro } from './scenes/Intro'
import { Outro } from './scenes/Outro'
import { Shot } from './scenes/Shot'
import type { ResolvedShot } from './shots'
import { SCENE } from './timing'

// A type alias, not an interface — see PromoProps for why.
export type StudioTourProps = {
  shots: ResolvedShot[]
}

/** The app's own title-bar wordmark — not a command: Studio runs from source (STUDIO_RUN). */
export const STUDIO_WORDMARK = 'seedr-studio'
export const STUDIO_TAGLINE = 'A desktop manager for a seedr registry.'
export const STUDIO_RUN = 'pnpm --filter @seedr/studio tauri:dev'

export const StudioTour: React.FC<StudioTourProps> = ({ shots }) => {
  const outroAt = SCENE.intro + shots.length * SCENE.shot

  return (
    <Ground>
      <Sequence from={0} durationInFrames={SCENE.intro}>
        <Intro
          durationInFrames={SCENE.intro}
          command={STUDIO_WORDMARK}
          prefix=""
          tagline={STUDIO_TAGLINE}
          items={['browse', 'add', 'edit', 'test install', 'publish']}
        />
      </Sequence>

      {shots.map((shot, i) => (
        <Sequence
          key={shot.file}
          name={shot.title}
          from={SCENE.intro + i * SCENE.shot}
          durationInFrames={SCENE.shot}
        >
          <Shot shot={shot} app={STUDIO_WORDMARK} durationInFrames={SCENE.shot} />
        </Sequence>
      ))}

      <Sequence from={outroAt} durationInFrames={SCENE.outro}>
        <Outro
          durationInFrames={SCENE.outro}
          title={STUDIO_WORDMARK}
          tagline={STUDIO_TAGLINE}
          footer={STUDIO_RUN}
        />
      </Sequence>
    </Ground>
  )
}
