import { useEffect, useState } from "react";
import { Pin, TriangleAlert } from "lucide-react";
import { fs } from "@/api/fs";
import { IconButton } from "@/core/ui/IconButton";
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
 * The title bar's warning that Studio is not where it usually is. On the default
 * checkout it says nothing — silence is the normal state, and a badge that is
 * always there is a badge nobody reads. Anywhere else it names the folder and
 * its remote in red, because the one mistake this app can make is changing the
 * wrong registry.
 */
export function RepoBadge() {
  const repo = useStudio((state) => state.repo);
  const makeRepoDefault = useStudio((state) => state.makeRepoDefault);
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    if (!repo || repo.isDefault) return;
    setOrigin(null);
    void fs
      .readText(".git/config")
      .then((config) => setOrigin(originSlug(config)))
      .catch(() => setOrigin(null));
  }, [repo]);

  if (!repo || repo.isDefault) return null;
  return (
    <span className="ml-3 flex min-w-0 items-center gap-2 text-sm text-destructive" role="alert">
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate" data-tip={repo.root}>
        Attention: outside the default folder — {repo.root}
      </span>
      {origin && <span className="shrink-0">{origin}</span>}
      <IconButton icon={Pin} ariaLabel="make this the default" tip="Treat this checkout as the default one and stop warning about it" accentColor="red" size="xs" onClick={() => void makeRepoDefault()} />
    </span>
  );
}
