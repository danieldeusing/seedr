import React from 'react'

import { AbsoluteFill } from 'remotion'

import { Prompt, Reveal, Rule, SceneFade } from '../chrome'
import { theme, type } from '../theme'

const AGENTS = ['Claude Code', 'GitHub Copilot', 'Google Antigravity', 'OpenAI Codex', 'OpenCode']

export const Intro: React.FC<{
  durationInFrames: number
  command?: string
  tagline?: string
  items?: string[]
}> = ({
  durationInFrames,
  command = 'seedr',
  tagline = 'Seed your coding agents with capabilities.',
  items = AGENTS,
}) => (
  <SceneFade durationInFrames={durationInFrames}>
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        padding: '0 140px',
        gap: 44,
      }}
    >
      <Prompt command={command} size={type.hero} />

      <Reveal at={30}>
        <div style={{ fontSize: type.section, color: theme.ink, lineHeight: 1.45 }}>{tagline}</div>
      </Reveal>

      <Reveal at={42}>
        <Rule width={720} />
      </Reveal>

      <Reveal at={48}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 34px', maxWidth: 1640 }}>
          {items.map((name) => (
            <span key={name} style={{ fontSize: type.body, color: theme.muted }}>
              <span style={{ color: theme.accent }}>· </span>
              {name}
            </span>
          ))}
        </div>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
)
