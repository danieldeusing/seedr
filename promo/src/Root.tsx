import React from 'react'

import { Composition, Still } from 'remotion'
import type { CalculateMetadataFunction } from 'remotion'

import './fonts'
import { Poster } from './Poster'
import { Promo } from './Promo'
import type { PromoProps } from './Promo'
import { presentShots } from './shots'
import { FPS, totalFrames } from './timing'

/**
 * The composition's length is derived from what is on disk, so the timeline in
 * the studio and the rendered file agree with `assets/` without anyone editing
 * a number.
 *
 * `calculateMetadata` runs before the first frame in both the studio and
 * `remotion render`, which is why the asset scan lives here and not in a
 * module-level constant — a constant would be read once, at bundle time,
 * before the studio has published its static-file list.
 */
const calculateMetadata: CalculateMetadataFunction<PromoProps> = () => {
  const shots = presentShots()
  return {
    durationInFrames: totalFrames(shots.length),
    props: { shots },
  }
}

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Promo"
      component={Promo}
      durationInFrames={totalFrames(4)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ shots: [] }}
      calculateMetadata={calculateMetadata}
    />

    <Still id="Poster" component={Poster} width={1920} height={1080} />
  </>
)
