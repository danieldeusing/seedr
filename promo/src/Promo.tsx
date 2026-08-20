import React from 'react'

import { Sequence } from 'remotion'

import { Ground } from './chrome'
import { CliDemo } from './scenes/CliDemo'
import { Intro } from './scenes/Intro'
import { Outro } from './scenes/Outro'
import { Question } from './scenes/Question'
import { Shot } from './scenes/Shot'
import type { ResolvedShot } from './shots'
import { SCENE } from './timing'

// A type alias rather than an interface: `<Composition>` constrains its props
// to `Record<string, unknown>`, and TypeScript grants an implicit index
// signature to an alias but never to an interface.
export type PromoProps = {
  shots: ResolvedShot[]
}

export const Promo: React.FC<PromoProps> = ({ shots }) => {
  // Sequences are laid end to end, so a slot with no file simply is not here
  // and everything after it moves up. No gap, no placeholder, no broken image.
  const questionAt = SCENE.intro
  const cliAt = questionAt + SCENE.question
  const firstShotAt = cliAt + SCENE.cli
  const outroAt = firstShotAt + shots.length * SCENE.shot

  return (
    <Ground>
      <Sequence from={0} durationInFrames={SCENE.intro}>
        <Intro durationInFrames={SCENE.intro} />
      </Sequence>

      <Sequence from={questionAt} durationInFrames={SCENE.question}>
        <Question durationInFrames={SCENE.question} />
      </Sequence>

      <Sequence from={cliAt} durationInFrames={SCENE.cli} name="cli">
        <CliDemo durationInFrames={SCENE.cli} />
      </Sequence>

      {shots.map((shot, i) => (
        <Sequence
          key={shot.file}
          name={shot.title}
          from={firstShotAt + i * SCENE.shot}
          durationInFrames={SCENE.shot}
        >
          <Shot shot={shot} durationInFrames={SCENE.shot} />
        </Sequence>
      ))}

      <Sequence from={outroAt} durationInFrames={SCENE.outro}>
        <Outro durationInFrames={SCENE.outro} />
      </Sequence>
    </Ground>
  )
}
