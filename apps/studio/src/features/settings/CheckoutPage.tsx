import { useEffect, useState } from "react";
import { Check, FolderOpen } from "lucide-react";
import { pickPath } from "@/api/agent";
import { defaultRepo } from "@/api/repo";
import { IconButton } from "@/core/ui/IconButton";
import { useStudio } from "@/features/explorer/store";

const input =
  "w-full border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Settings → checkout: which folder Studio treats as home. Everywhere else is
 * flagged in the title bar, so this is the one place that decides what "not
 * home" means. It starts at whatever the host recorded — the first checkout
 * ever opened — and is edited here rather than adopted by a button in the
 * warning, where agreeing was easier than reading.
 */
export function CheckoutPage() {
  const repo = useStudio((state) => state.repo);
  const makeRepoDefault = useStudio((state) => state.makeRepoDefault);
  const [path, setPath] = useState("");
  const [stored, setStored] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void defaultRepo()
      .then((recorded) => {
        // Nothing recorded yet means the checkout that is open is the answer.
        const current = recorded ?? repo?.root ?? "";
        setStored(current);
        setPath(current);
      })
      .catch((failure: Error) => setError(failure.message));
  }, [repo]);

  const save = async () => {
    setSaving(true);
    const failure = await makeRepoDefault(path.trim());
    setSaving(false);
    setError(failure);
    if (!failure) setStored(path.trim());
  };

  const choose = async () => {
    const picked = await pickPath("folder");
    if (picked) setPath(picked);
  };

  const changed = path.trim() !== stored;
  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-sm font-medium tracking-wider text-neutral-400 uppercase">default checkout</h3>
        <p className="mt-1 text-neutral-500">
          The registry Studio treats as home. Open any other one and the title bar says so in red, because changing the wrong registry is the mistake this app can make.
        </p>
      </header>

      <div className="space-y-3 border border-neutral-960 bg-neutral-980 p-4">
        <div className="field-row">
          <label className="lbl" htmlFor="default-checkout" data-tip="An absolute path to a folder holding a registry/ directory">
            folder
          </label>
          <div className="field-val">
            <input id="default-checkout" className={input} value={path} onChange={(event) => setPath(event.target.value)} placeholder="/Users/you/Work/seedr" disabled={saving} />
            <IconButton icon={FolderOpen} ariaLabel="choose the default checkout" tip="Pick the folder" onClick={() => void choose()} disabled={saving} />
          </div>
        </div>
        {repo && repo.root !== path.trim() && (
          <div className="field-row">
            <span className="lbl" />
            <p className="field-val text-muted-foreground">
              <button type="button" className="doc-link doc-link--forward cursor-pointer" onClick={() => setPath(repo.root)}>
                use the checkout that is open ({repo.name})
              </button>
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-neutral-700 pt-3">
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-500" role="status">
          {saving ? "recording…" : changed ? "unsaved change" : stored ? `home is ${stored}` : "no default recorded yet"}
        </span>
        <IconButton icon={Check} ariaLabel="save the default checkout" tip="Record this folder as home" accentColor="violet" onClick={() => void save()} disabled={saving || !changed || !path.trim()} spin={saving} />
      </div>
    </div>
  );
}
