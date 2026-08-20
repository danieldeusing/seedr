import React from 'react'

import { Sequence } from 'remotion'

import { Ground } from './chrome'
import { Outro } from './scenes/Outro'
import { SCENE } from './timing'

/**
 * The poster frame: the closing title card, held still.
 *
 * A `<Still>` always renders frame 0, and frame 0 of every scene here is the
 * first frame of its fade-in — an empty cream rectangle. `from={-60}` shifts
 * the card's own clock forward by 60 frames, so the still shows it settled.
 */
export const Poster: React.FC = () => (
  <Ground>
    <Sequence from={-60}>
      <Outro durationInFrames={SCENE.outro} />
    </Sequence>
  </Ground>
)
