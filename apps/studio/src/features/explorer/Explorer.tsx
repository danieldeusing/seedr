import type { ComponentType } from "@seedr/shared";
import { ALL_TYPES, typeDirName } from "@seedr/registry-ops/pure";
import { countByType, type StudioItem } from "./registry";
import type { Selection } from "./store";

interface ExplorerProps {
  items: StudioItem[];
  problems: string[];
  selected: Selection | null;
  onSelect(selection: Selection): void;
}

const sameKey = (a: Selection | null, type: ComponentType, slug: string) => a?.type === type && a.slug === slug;

/** The registry by type, counts in the section heads, invalid items flagged inline. */
export function Explorer({ items, problems, selected, onSelect }: ExplorerProps) {
  const counts = countByType(items);
  if (items.length === 0 && problems.length === 0) {
    return (
      <div className="p-6 text-muted-foreground" data-testid="empty-registry">
        <p className="prompt">ls registry/</p>
        <p className="mt-4">This registry has no items yet.</p>
        <p className="mt-2 text-xs">Add the first one with “add capability” above, or with <code className="text-primary">/add-toolr</code> in Claude Code.</p>
      </div>
    );
  }
  return (
    <nav aria-label="Registry" className="min-h-0 flex-1 overflow-y-auto p-4">
      {problems.length > 0 && (
        <section className="mb-4 border border-destructive p-3 text-xs" role="alert">
          <p className="font-bold text-destructive">{problems.length} unreadable item file(s)</p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </section>
      )}
      {ALL_TYPES.map((type) => {
        const ofType = items.filter((i) => i.type === type);
        return (
          <section key={type} className="mb-5" aria-labelledby={`section-${type}`}>
            <h2 id={`section-${type}`} className="mb-1 text-xs font-bold tracking-wide text-primary">
              {typeDirName(type)}/ <span className="font-normal text-muted-foreground">{counts[type]}</span>
            </h2>
            {ofType.length === 0 ? (
              <p className="pl-3 text-xs text-muted-foreground">empty</p>
            ) : (
              <ul>
                {ofType.map(({ slug, item, errors }) => {
                  const active = sameKey(selected, type, slug);
                  return (
                    <li key={slug}>
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => onSelect({ type, slug })}
                        className={`block w-full truncate px-3 py-1 text-left text-xs hover:bg-muted ${active ? "bg-muted text-primary" : ""}`}
                      >
                        {item.name ?? slug}
                        {errors.length > 0 && (
                          <span className="ml-2 text-destructive" title={`${errors.length} validation problem(s)`} aria-label={`${errors.length} validation problems`}>
                            !
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}
