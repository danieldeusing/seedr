/**
 * An item's version, for first-party content this registry maintains.
 *
 * It tracks the **installable content**, not the entry. Renaming an item or
 * rewriting its description changes nothing an install would put on disk, so
 * neither bumps it; changing a `SKILL.md` does. That is the only reading under
 * which "my copy is version 1.2.0, the registry says 1.3.0" means anything.
 *
 * Bumped by the operations rather than by hand, because a number someone has to
 * remember to raise is a number that stops being true. A deliberate minor or
 * major is still set explicitly through an `update`, and that wins.
 *
 * Synced items keep whatever their upstream says — `version` on a plugin comes
 * from its marketplace entry, and is not ours to renumber.
 */
export const INITIAL_VERSION = "1.0.0";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * The next patch version, or a fresh `1.0.0` when there is nothing to go on.
 * A version that is not `x.y.z` — an upstream's `2026.08.1`, say — is left alone
 * rather than reinterpreted.
 */
export function bumpPatch(version: string | undefined): string {
  if (version === undefined) return INITIAL_VERSION;
  const parsed = SEMVER.exec(version);
  if (!parsed) return version;
  return `${parsed[1]}.${parsed[2]}.${Number(parsed[3]) + 1}`;
}

/** Whether a version string is one this registry can count on. */
export const isSemver = (version: string): boolean => SEMVER.test(version);
