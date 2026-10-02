import React from 'react'

import { Sequence } from 'remotion'

import { Ground } from './chrome'
import { Outro } from './scenes/Outro'
import { STUDIO_RUN, STUDIO_TAGLINE } from './StudioTour'
import { SCENE } from './timing'

/** Studio's closing card, held still — `from={-60}` for the same reason as in `Poster`. */
export const StudioPoster: React.FC = () => (
  <Ground>
    <Sequence from={-60}>
      <Outro
        durationInFrames={SCENE.outro}
        title="seedr studio"
        tagline={STUDIO_TAGLINE}
        footer={STUDIO_RUN}
      />
    </Sequence>
  </Ground>
)
