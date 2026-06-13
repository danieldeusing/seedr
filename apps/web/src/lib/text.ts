/**
 * Returns the plural form of a word based on count.
 * Words that already end in "s" (e.g. "settings") stay unchanged.
 */
export function pluralize(word: string, count: number): string {
  return count === 1 || word.endsWith("s") ? word : `${word}s`;
}

/**
 * Formats an ISO date string as a relative time (e.g., "2d ago", "3mo ago").
 */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
