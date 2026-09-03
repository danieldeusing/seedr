/**
 * "today", "yesterday", "3 days ago" — counted in local calendar days, so a
 * change late last night reads as yesterday rather than as "0 days ago". A
 * date that will not parse comes back as it was, and a clock that runs ahead
 * of the source's still says today.
 */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
