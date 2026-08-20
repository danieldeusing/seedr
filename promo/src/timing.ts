export const FPS = 30

/**
 * Scene lengths in frames. The five fixed scenes total 800 frames (26.7s) and
 * each present screenshot adds 180 (6s), so the full video with all four
 * assets is 1520 frames — 50.7 seconds.
 *
 * Six seconds a shot rather than four because each caption is two full
 * sentences over a screenshot worth reading — four was measurably too fast on
 * the configr promo.
 *
 * The CLI scene gets 330 (11s): it types a command and then reveals a
 * fourteen-line install transcript, and the transcript IS the pitch — cutting
 * away before a viewer has read the five target paths wastes the whole scene.
 */
export const SCENE = {
  intro: 110,
  question: 125,
  cli: 330,
  shot: 180,
  outro: 100,
} as const

export const FIXED_FRAMES = SCENE.intro + SCENE.question + SCENE.cli + SCENE.outro

export const totalFrames = (shotCount: number): number => FIXED_FRAMES + shotCount * SCENE.shot
