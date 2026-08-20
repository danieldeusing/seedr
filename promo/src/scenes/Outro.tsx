import React from 'react'

import { AbsoluteFill } from 'remotion'

import { Reveal, Rule, SceneFade } from '../chrome'
import { theme, type } from '../theme'

export const Outro: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
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
        seedr
      </div>

      <Reveal at={10}>
        <Rule width={520} color={theme.accent} />
      </Reveal>

      <Reveal at={16}>
        <div style={{ fontSize: type.section, color: theme.ink, textAlign: 'center' }}>
          Seed your coding agents with capabilities.
        </div>
      </Reveal>

      <Reveal at={26}>
        <div style={{ fontSize: type.meta, color: theme.muted, marginTop: 14 }}>
          seedr.danieldeusing.de · npx @danieldeusing/seedr
        </div>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
)
