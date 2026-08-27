import { useEffect, useState } from "react";
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { LabelColor, LabelDefinition } from "@seedr/shared";
import { LABEL_COLORS } from "@seedr/registry-ops/pure";
import { IconButton } from "@/core/ui/IconButton";
import { Select } from "@/core/ui/Select";
import { useStudio } from "@/features/explorer/store";
import { useLabels } from "./labels";

const input =
  "w-full border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/** A name typed by hand, as the slug it would be stored under. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** What the catalogue would refuse before the transaction is even asked. */
export function labelProblems(labels: LabelDefinition[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    if (!label.name.trim()) problems.push("a label needs a name");
    else if (!label.slug) problems.push(`${label.name}: that name has no slug in it`);
    else if (seen.has(label.slug)) problems.push(`${label.slug}: two labels cannot share a slug`);
    seen.add(label.slug);
  }
  return [...new Set(problems)];
}

// Written out because Tailwind generates from literal class names: `bg-${color}-500`
// compiles to nothing at all.
const SWATCH: Record<LabelColor, string> = {
  neutral: "bg-neutral-500",
  green: "bg-green-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  indigo: "bg-indigo-500",
  teal: "bg-teal-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

/**
 * Settings → labels: the catalogue every item picks from. It lives in the
 * checkout, so this page edits the registry — saving is one transaction, and
 * removing a label that items still carry is refused with their names.
 */
export function LabelsPage() {
  const stored = useLabels((state) => state.labels);
  const loading = useLabels((state) => state.loading);
  const error = useLabels((state) => state.error);
  const { load, save } = useLabels.getState();
  const registryDir = useStudio((state) => state.repo?.registryDir ?? "");
  const [draft, setDraft] = useState<LabelDefinition[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (registryDir) void load(registryDir);
  }, [load, registryDir]);

  useEffect(() => {
    setDraft(stored);
  }, [stored]);

  const problems = labelProblems(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(stored);

  const edit = (index: number, patch: Partial<LabelDefinition>) =>
    setDraft((current) => current.map((label, at) => (at === index ? { ...label, ...patch } : label)));

  const apply = async () => {
    setSaving(true);
    await save(draft);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium tracking-wider text-neutral-400 uppercase">labels</h3>
          <p className="mt-1 text-neutral-500">
            What an item is for, when one registry serves several projects. Labels live in the checkout — in <code>registry/labels.json</code> — so everyone working on it sees the same list, and the CLI and the web app read the same file.
          </p>
        </div>
        <span className="flex-1" />
        <IconButton
          icon={Plus}
          ariaLabel="add label"
          tip="Add a label"
          accentColor="violet"
          onClick={() => setDraft((current) => [...current, { slug: "", name: "", color: "violet" }])}
          disabled={saving}
        />
      </header>

      {loading && <p className="text-muted-foreground">loading…</p>}
      {!loading && draft.length === 0 && <p className="text-muted-foreground">No labels yet. Items without one are simply unlabelled.</p>}

      <ul className="space-y-3">
        {draft.map((label, index) => (
          <li key={index} className="flex items-center gap-2 border border-neutral-960 bg-neutral-980 p-3">
            <span className={`size-3 shrink-0 rounded-full ${SWATCH[label.color]}`} aria-hidden="true" />
            <input
              className={input}
              value={label.name}
              placeholder="Project X"
              aria-label={`label ${index + 1} name`}
              onChange={(event) => edit(index, { name: event.target.value, slug: slugify(event.target.value) })}
              disabled={saving}
            />
            <code className="w-40 shrink-0 truncate text-muted-foreground" data-tip="How items refer to this label, and what `--label` takes">
              {label.slug || "—"}
            </code>
            <Select<LabelColor>
              ariaLabel={`label ${index + 1} colour`}
              value={label.color}
              options={LABEL_COLORS.map((color) => ({ value: color, label: color }))}
              onChange={(color) => edit(index, { color })}
              disabled={saving}
            />
            <IconButton
              icon={Trash2}
              ariaLabel={`remove ${label.name || "label"}`}
              tip="Remove — refused while items still carry it"
              accentColor="red"
              onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}
              disabled={saving}
            />
          </li>
        ))}
      </ul>

      {problems.length > 0 && (
        <p className="text-destructive" role="alert">
          {problems.join("; ")}
        </p>
      )}
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-neutral-700 pt-3">
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-500" role="status">
          {saving ? "applying…" : changed ? "unsaved changes" : "saved"}
        </span>
        <IconButton icon={RotateCcw} ariaLabel="discard changes" tip="Back to what the checkout says" onClick={() => setDraft(stored)} disabled={saving || !changed} />
        <IconButton icon={Check} ariaLabel="save labels" tip="Write the catalogue as one transaction" accentColor="violet" onClick={() => void apply()} disabled={saving || !changed || problems.length > 0} spin={saving} />
      </div>
    </div>
  );
}
