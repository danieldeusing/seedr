import { useAuthorSettings } from "./authorSettings";

const input =
  "w-full border border-violet-500/30 bg-transparent px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none";

/**
 * Settings → author: who first-party items are credited to. Prefilled into the
 * add form, where it can still be changed for one item.
 */
export function AuthorPage() {
  const author = useAuthorSettings((state) => state.author);
  const set = useAuthorSettings((state) => state.set);

  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-sm font-medium tracking-wider text-neutral-400 uppercase">author</h3>
        <p className="mt-1 text-neutral-500">Credited on the items you add here. Left empty, the add form falls back to this checkout's git remote — right for one repository, wrong on a fork or under another name.</p>
      </header>
      <div className="space-y-3 border border-neutral-960 bg-neutral-980 p-4">
        <div className="field-row">
          <label className="lbl" htmlFor="author-settings-name" data-tip="The name written into every item.json you add">
            name
          </label>
          <div className="field-val">
            <input id="author-settings-name" className={input} value={author.name} onChange={(event) => set("name", event.target.value)} placeholder="Your name" />
          </div>
        </div>
        <div className="field-row">
          <label className="lbl" htmlFor="author-settings-url" data-tip="Optional — a profile or homepage, stored beside the name">
            url
          </label>
          <div className="field-val">
            <input id="author-settings-url" className={input} value={author.url} onChange={(event) => set("url", event.target.value)} placeholder="https://github.com/you" />
          </div>
        </div>
      </div>
    </div>
  );
}
