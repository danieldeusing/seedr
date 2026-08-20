import React from 'react'

import { AbsoluteFill } from 'remotion'

import { Reveal, SceneFade } from '../chrome'
import { theme, type } from '../theme'

/**
 * The paths are the real install targets the CLI writes to — the point of the
 * scene is that the same capability has to land in five different layouts,
 * and by hand that is five copy-paste jobs that drift apart.
 */
const PATHS = [
  '.claude/skills/',
  '.github/skills/',
  '.gemini/skills/',
  '.codex/skills/',
  '.opencode/skills/',
  '.claude/hooks/',
  '.mcp.json',
  '~/.claude/settings.json',
  '.opencode/command/',
  'AGENTS.md',
]

export const Question: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <SceneFade durationInFrames={durationInFrames}>
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 140px', gap: 52 }}>
      <div
        style={{
          fontSize: type.hero,
          color: theme.inkStrong,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          maxWidth: 1560,
        }}
      >
        The same capability,
        <br />
        <span style={{ color: theme.accent }}>five times over</span>?
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', maxWidth: 1560 }}>
        {PATHS.map((path, i) => (
          <Reveal key={path} at={26 + i * 4} distance={6}>
            <span
              style={{
                fontSize: type.meta,
                color: theme.muted,
                backgroundColor: theme.panel,
                border: `1px solid ${theme.border}`,
                padding: '7px 14px',
                display: 'inline-block',
              }}
            >
              {path}
            </span>
          </Reveal>
        ))}
      </div>
    </AbsoluteFill>
  </SceneFade>
)
