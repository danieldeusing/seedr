/*
 * A unified diff, coloured. Shared, because two things show one now: the git
 * panel's changed paths, and what a capability's source folder has that the copy
 * here does not.
 */

/** Unified-diff ink: additions succeed, removals are destructive, hunk heads point. */
function diffLineClass(line: string): string | undefined {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git") || line.startsWith("index ")) return "text-muted-foreground";
  if (line.startsWith("@@")) return "text-primary";
  if (line.startsWith("+")) return "text-success";
  if (line.startsWith("-")) return "text-destructive";
  return undefined;
}

export function DiffText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <span key={index} className={diffLineClass(line)}>
          {line}
          {"\n"}
        </span>
      ))}
    </>
  );
}
