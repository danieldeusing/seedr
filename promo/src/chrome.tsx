import React from 'react'

import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'

import { theme, type } from './theme'

/**
 * The cream ground plus a static scanline texture.
 *
 * The scanlines are 6px apart and very faint, which is quieter than the
 * estate's own `--scanline-opacity`. A 1px period at 0.15 is the right texture
 * on a screen and the wrong one in an H.264 file: fine horizontal stripes are
 * the encoder's worst case, and they crawl. Holding the pattern still and
 * coarse keeps it as texture the encoder pays for once.
 */
export const Ground: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.ground,
      fontFamily: type.mono,
      color: theme.ink,
    }}
  >
    {children}
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        backgroundImage: `repeating-linear-gradient(
          to bottom,
          rgba(36, 26, 18, 0.05) 0px,
          rgba(36, 26, 18, 0.05) 1px,
          transparent 1px,
          transparent 6px
        )`,
      }}
    />
  </AbsoluteFill>
)

/** Fades a scene up at its start and back down at its end, and drifts it a little. */
export const SceneFade: React.FC<{
  durationInFrames: number
  children: React.ReactNode
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const lift = interpolate(frame, [0, 22], [14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${lift}px)` }}>{children}</AbsoluteFill>
  )
}

/** The estate's `$ ` prompt, typed one character at a time. */
export const Prompt: React.FC<{
  command: string
  /** Frame at which typing starts. */
  from?: number
  /** Frames per character. */
  speed?: number
  size?: number
  showCursor?: boolean
}> = ({ command, from = 0, speed = 2, size = type.title, showCursor = true }) => {
  const frame = useCurrentFrame()
  const typed = Math.max(0, Math.min(command.length, Math.floor((frame - from) / speed)))
  const done = typed === command.length
  const blinkOn = Math.floor(frame / 15) % 2 === 0

  return (
    <div style={{ fontSize: size, color: theme.inkStrong, letterSpacing: '-0.02em' }}>
      <span style={{ color: theme.accent }}>$ </span>
      {command.slice(0, typed)}
      {showCursor && (!done || blinkOn) ? (
        <span
          style={{
            display: 'inline-block',
            width: '0.5em',
            height: '0.88em',
            marginLeft: '0.08em',
            verticalAlign: 'text-bottom',
            backgroundColor: theme.accent,
          }}
        />
      ) : null}
    </div>
  )
}

/** The estate's ASCII rule. */
export const Rule: React.FC<{ width?: number | string; color?: string }> = ({
  width = '100%',
  color = theme.border,
}) => <div style={{ width, height: 2, backgroundColor: color }} />

/**
 * A line that reveals itself after `at`, with a small rise.
 * Everything in this video enters the same way, so it is one component.
 */
export const Reveal: React.FC<{
  at: number
  children: React.ReactNode
  distance?: number
}> = ({ at, children, distance = 10 }) => {
  const frame = useCurrentFrame()
  const t = interpolate(frame, [at, at + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <div style={{ opacity: t, transform: `translateY(${(1 - t) * distance}px)` }}>{children}</div>
  )
}

/** The `NN ── title` marker every screenshot scene wears. */
export const SceneLabel: React.FC<{ index: string; title: string }> = ({ index, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
    <span style={{ fontSize: type.meta, color: theme.muted }}>{index}</span>
    <div style={{ width: 44, height: 2, backgroundColor: theme.border }} />
    <span
      style={{
        fontSize: type.section,
        color: theme.accent,
        fontWeight: 700,
        letterSpacing: '-0.01em',
      }}
    >
      {title}
    </span>
  </div>
)
