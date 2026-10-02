import React from 'react'

import { AbsoluteFill } from 'remotion'

import { Reveal, Rule, SceneFade } from '../chrome'
import { theme, type } from '../theme'

export const Outro: React.FC<{
  durationInFrames: number
  title?: string
  tagline?: string
  footer?: string
}> = ({
  durationInFrames,
  title = 'seedr',
  tagline = 'Seed your coding agents with capabilities.',
  footer = 'seedr.danieldeusing.de · npx @danieldeusing/seedr',
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', gap: 34 }}>
      <div
        style={{
          fontSize: type.hero,
          color: theme.accent,
          fontWeight: 700,
          letterSpacing: '-0.03em',
        }}
      >
        {title}
      </div>

      <Reveal at={10}>
        <Rule width={520} color={theme.accent} />
      </Reveal>

      <Reveal at={16}>
        <div style={{ fontSize: type.section, color: theme.ink, textAlign: 'center' }}>{tagline}</div>
      </Reveal>

      <Reveal at={26}>
        <div style={{ fontSize: type.meta, color: theme.muted, marginTop: 14 }}>{footer}</div>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
)
