import { useEffect, useState } from "react";
import { fs } from "@/api/fs";
import { useStudio } from "@/features/explorer/store";

/**
 * `owner/repo` of the `origin` remote, from the checkout's own git config. Both
 * URL spellings are in use here — `git@github.com:owner/repo.git` and
 * `https://github.com/owner/repo` — and a checkout with no remote is normal.
 */
export function originSlug(gitConfig: string): string | null {
  const section = /\[remote "origin"]([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(gitConfig);
  const url = /^\s*url\s*=\s*(.+)$/m.exec(section?.[1] ?? "")?.[1]?.trim();
  if (!url) return null;
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Which checkout is open, in the title bar. Studio works on whatever folder it
 * was pointed at, and it remembers that folder between launches — so the one
 * question the window has to answer at a glance is "which registry am I about
 * to change?".
 */
export function RepoBadge() {
  const repo = useStudio((state) => state.repo);
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    if (!repo) return;
    setOrigin(null);
    void fs
      .readText(".git/config")
      .then((config) => setOrigin(originSlug(config)))
      .catch(() => setOrigin(null));
  }, [repo]);

  if (!repo) return null;
  return (
    <span className="ml-3 flex min-w-0 items-center gap-2 text-sm text-neutral-500" data-tip={repo.root}>
      <span className="text-neutral-600">·</span>
      <span className="truncate text-neutral-300">{repo.name}</span>
      {origin && <span className="truncate">{origin}</span>}
    </span>
  );
}
