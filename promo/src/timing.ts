export const FPS = 30

/**
 * Scene lengths in frames. The four fixed scenes total 665 frames (22.2s) and
 * each present screenshot adds 180 (6s), so the full video with all four
 * assets is 1385 frames — 46.2 seconds.
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

/** The Studio tour: intro, its shots, outro — no question or CLI scene. */
export const studioTotalFrames = (shotCount: number): number =>
  SCENE.intro + shotCount * SCENE.shot + SCENE.outro
