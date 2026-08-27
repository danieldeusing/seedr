/**
 * Settings that belong to a checkout rather than to this machine.
 *
 * Author and pre-prompts were one key each, so opening a fork showed the
 * settings of whatever was opened last: the wrong name credited on a fork's
 * items, and a pre-prompt naming a skill that checkout does not have. They are
 * per-repository now, keyed by its absolute path.
 *
 * The machine-wide key is still read when a repository has none of its own, so
 * settings configured before this change are not lost. Nothing writes it again,
 * so each checkout gets its own the first time it is edited.
 */
export const repoScopedKey = (base: string, root: string): string => (root ? `${base}::${root}` : base);

export function readRepoScoped(base: string, root: string): string | null {
  try {
    return localStorage.getItem(repoScopedKey(base, root)) ?? localStorage.getItem(base);
  } catch {
    return null;
  }
}

export function writeRepoScoped(base: string, root: string, value: string): void {
  try {
    localStorage.setItem(repoScopedKey(base, root), value);
  } catch {
    // A settings page is not worth breaking over a full or blocked store.
  }
}
