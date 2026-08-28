/**
 * Checkouts Studio has had open, most recent first.
 *
 * The machine's, not the checkout's: it is a list OF checkouts, so storing it in
 * one of them would lose it the moment you switched away — which is the only
 * moment it is wanted.
 *
 * Paths only. A name would go stale the moment a folder is renamed, and the
 * folder name is derivable; what cannot be derived is that you have been there.
 */
const STORAGE_KEY = "studio-repo-history";
const LIMIT = 8;

export const readHistory = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === "string") : [];
  } catch {
    return [];
  }
};

/** Record a checkout as the most recently opened, without duplicating it. */
export function rememberRepo(path: string): string[] {
  // Filtered before unshifting rather than after, so re-opening a checkout
  // moves it to the front instead of leaving a second copy further down.
  const history = [path, ...readHistory().filter((seen) => seen !== path)].slice(0, LIMIT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // A full store is not worth failing to open a checkout over.
  }
  return history;
}

/** Drop one entry — a path that no longer opens is worth forgetting. */
export function forgetRepo(path: string): string[] {
  const history = readHistory().filter((seen) => seen !== path);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // As above.
  }
  return history;
}

/** The last path segment — what a person calls the checkout. */
export const repoLabel = (path: string): string => path.replace(/\/+$/, "").split("/").pop() || path;
