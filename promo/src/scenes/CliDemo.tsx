import React from 'react'

import { AbsoluteFill } from 'remotion'

import { Prompt, Reveal, SceneFade } from '../chrome'
import { theme, type } from '../theme'

/**
 * The install, rendered as text rather than screenshotted from a real
 * terminal — deliberately. A terminal capture drags its scrollback into
 * frame (the configr shoot caught a private key that way), while rendered
 * text is legible at any size and can disclose nothing it does not say.
 *
 * The transcript is the CLI's real output (clack glyphs and all), taken from
 * an actual `seedr add pdf` run on 2026-08-11 and shortened only in the ways
 * a viewer cannot check: the item description is cut mid-sentence and the
 * absolute install paths are shown from a project root named `my-project`.
 */
const COMMAND = 'npx @danieldeusing/seedr add pdf'

type Line = { text: string; glyph?: string; glyphColor?: string; indent?: boolean }

const LINES: Line[] = [
  { glyph: '┌', text: 'Seedr', glyphColor: theme.muted },
  {
    glyph: '◇',
    text: 'Selected: Pdf (skill) — Use this skill whenever the user wants to do anything with PDF files…',
    glyphColor: theme.muted,
  },
  { glyph: '◇', text: 'Agents: claude, copilot, gemini, codex, opencode', glyphColor: theme.muted },
  { glyph: '◇', text: 'Scope: project', glyphColor: theme.muted },
  { glyph: '◇', text: 'Method: copy', glyphColor: theme.muted },
  { glyph: '✔', text: 'Installed Pdf for Claude Code', glyphColor: theme.success },
  { glyph: '✔', text: 'Installed Pdf for GitHub Copilot', glyphColor: theme.success },
  { glyph: '✔', text: 'Installed Pdf for Gemini Code Assist', glyphColor: theme.success },
  { glyph: '✔', text: 'Installed Pdf for OpenAI Codex CLI', glyphColor: theme.success },
  { glyph: '✔', text: 'Installed Pdf for OpenCode', glyphColor: theme.success },
  { glyph: '◆', text: 'Installed for 5 agent(s)', glyphColor: theme.accent },
  { text: '→ ~/my-project/.claude/skills/pdf', indent: true },
  { text: '→ ~/my-project/.github/skills/pdf', indent: true },
  { text: '→ ~/my-project/.gemini/skills/pdf', indent: true },
  { text: '→ ~/my-project/.codex/skills/pdf', indent: true },
  { text: '→ ~/my-project/.opencode/skills/pdf', indent: true },
  { glyph: '└', text: 'Installation complete', glyphColor: theme.muted },
]

/** Typing ends around frame 64 (32 chars × 2 f/char); output follows. */
const OUTPUT_AT = 78
const LINE_EVERY = 7

export const CliDemo: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <SceneFade durationInFrames={durationInFrames}>
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 120px' }}>
      <div
        style={{
          width: 1560,
          backgroundColor: theme.card,
          border: `2px solid ${theme.border}`,
        }}
      >
        <div
          style={{
            height: 46,
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
            seedr — one command, five agents
          </span>
        </div>

        <div style={{ padding: '30px 38px 34px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <Prompt command={COMMAND} size={type.section} speed={2} />

          {LINES.map((line, i) => (
            <Reveal key={line.text} at={OUTPUT_AT + i * LINE_EVERY} distance={5}>
              <div
                style={{
                  fontSize: type.term,
                  lineHeight: 1.35,
                  color: line.indent ? theme.accent : theme.ink,
                  paddingLeft: line.indent ? 56 : 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {line.glyph ? (
                  <span style={{ color: line.glyphColor ?? theme.muted }}>{line.glyph} </span>
                ) : null}
                {line.text}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  </SceneFade>
)
