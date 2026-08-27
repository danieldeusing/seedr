import { spawnSync } from "node:child_process";

/**
 * Which of `files` git ignores inside `dir`, as relative paths.
 *
 * Used on both sides of a local-source comparison, which is the point: the copy
 * drops what git ignores in the registry, and the source is digested with the
 * same rule applied in its own checkout. Filtering the two differently would
 * report every editor dropping as a change to the source.
 *
 * Outside a git checkout — registry fixtures in tests — there is nothing to
 * consult and nothing is ignored.
 */
export function gitIgnored(dir: string, files: string[]): string[] {
  if (files.length === 0) return [];
  const check = spawnSync("git", ["-C", dir, "check-ignore", "--stdin", "-z"], { input: files.join("\0"), encoding: "utf8" });
  // 0 = some ignored, 1 = none ignored; anything else (128: not a repository) means no answer.
  if (check.error || check.status === null || check.status > 1) return [];
  return check.stdout.split("\0").filter(Boolean);
}
