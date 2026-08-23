/**
 * Canonical registry slug rules, shared by the registry loader, the `remove`
 * command and every handler's uninstall path (defence in depth — handlers are
 * exported and callable without the command layer).
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const MAX_SLUG_LENGTH = 100;

export function isValidSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(value)
  );
}

/**
 * Throw unless `value` is a canonical slug. The error names the offending value
 * in JSON form so control characters and unicode look-alikes stay visible.
 */
export function assertValidSlug(value: unknown, what = "item slug"): asserts value is string {
  if (!isValidSlug(value)) {
    throw new Error(
      `Invalid ${what}: ${JSON.stringify(value)} (expected ${SLUG_PATTERN.source}, at most ${MAX_SLUG_LENGTH} characters)`
    );
  }
}
