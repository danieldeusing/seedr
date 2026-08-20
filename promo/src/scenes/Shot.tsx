import React from 'react'

import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion'

import { Reveal, SceneFade, SceneLabel } from '../chrome'
import type { ResolvedShot } from '../shots'
import { theme, type } from '../theme'

/** The window the screenshot sits in. Inner area is 1120 x 714, which is 16:10. */
const FRAME_W = 1120
const FRAME_H = 760
const TITLEBAR_H = 46

/**
 * One screenshot, in a window frame, with its caption beside it.
 *
 * `objectFit: 'contain'` is the reason any capture ratio is safe: a shot wider
 * or narrower than the frame is fitted whole and the leftover is the card
 * colour, so nothing is ever cropped or stretched. 16:10 fills it exactly.
 */
export const Shot: React.FC<{ shot: ResolvedShot; durationInFrames: number }> = ({
  shot,
  durationInFrames,
}) => {
  const frame = useCurrentFrame()
  // A slow push-in, so a still screenshot is not a still frame for four
  // seconds. It scales the WINDOW, not the image inside it: scaling the image
  // pushes its edges past the frame and quietly crops the screenshot, which is
  // the one thing a product shot may not do. Growing the window instead moves
  // everything and keeps the contain-fit exact at every frame.
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.03], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <SceneFade durationInFrames={durationInFrames}>
      <AbsoluteFill
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0 100px',
          gap: 70,
        }}
      >
        <div
          style={{
            width: FRAME_W,
            height: FRAME_H,
            backgroundColor: theme.card,
            border: `2px solid ${theme.border}`,
            overflow: 'hidden',
            flexShrink: 0,
            transform: `scale(${scale})`,
          }}
        >
          <div
            style={{
              height: TITLEBAR_H,
              backgroundColor: theme.panel,
              borderBottom: `2px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 16px',
            }}
          >
            {[theme.accent, theme.muted, theme.border].map((dot) => (
              <span
                key={dot}
                style={{ width: 11, height: 11, backgroundColor: dot, display: 'inline-block' }}
              />
            ))}
            <span style={{ fontSize: type.meta, color: theme.muted, marginLeft: 14 }}>
              seedr — {shot.title}
            </span>
          </div>

          <div
            style={{
              height: FRAME_H - TITLEBAR_H,
              overflow: 'hidden',
              backgroundColor: theme.card,
            }}
          >
            <Img
              src={shot.src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 530 }}>
          <SceneLabel index={shot.index} title={shot.title} />
          {shot.lines.map((line, i) => (
            <Reveal key={line} at={12 + i * 9}>
              <div style={{ fontSize: type.body, color: theme.ink, lineHeight: 1.55 }}>{line}</div>
            </Reveal>
          ))}
        </div>
      </AbsoluteFill>
    </SceneFade>
  )
}
