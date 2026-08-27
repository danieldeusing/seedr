import { useState } from "react";
import { Cpu, FolderGit2, MessageSquareText, Tag, Terminal, UserRound, type LucideIcon } from "lucide-react";
import { AuthorPage } from "./AuthorPage";
import { CheckoutPage } from "./CheckoutPage";
import { LabelsPage } from "./LabelsPage";
import { CodingAgentsPage } from "./CodingAgentsPage";
import { ModelsPage } from "./ModelsPage";
import { PrePromptsPage } from "./PrePromptsPage";

type Page = "agents" | "models" | "pre-prompts" | "author" | "labels" | "checkout";

const PAGES: { id: Page; label: string; icon: LucideIcon; tip: string }[] = [
  { id: "agents", label: "coding agents", icon: Terminal, tip: "The agent CLIs Studio can run, and where they are" },
  { id: "models", label: "models", icon: Cpu, tip: "Which model each job runs on — asked of each CLI, never a list written here" },
  { id: "pre-prompts", label: "pre-prompts", icon: MessageSquareText, tip: "Standing context per capability type, for adds and edits" },
  { id: "author", label: "author", icon: UserRound, tip: "Who the items you add are credited to" },
  { id: "labels", label: "labels", icon: Tag, tip: "What an item is for, when one registry serves several projects" },
  { id: "checkout", label: "checkout", icon: FolderGit2, tip: "Which registry Studio treats as home" },
];

/** Settings, configr's shape: a nav on the left, one page on the right. */
export function SettingsPanel() {
  const [page, setPage] = useState<Page>("agents");

  return (
    <section className="flex h-full min-h-0 text-xs">
      <nav className="w-48 shrink-0 overflow-y-auto border-r border-border p-2" aria-label="settings sections">
        {PAGES.map(({ id, label, icon: Icon, tip }) => (
          <button
            key={id}
            type="button"
            data-tip={tip}
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
            className={`flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left transition-colors ${
              page === id ? "bg-violet-500/20 text-neutral-200" : "text-neutral-400 hover:bg-neutral-960/50 hover:text-neutral-200"
            }`}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {page === "agents" && <CodingAgentsPage />}
        {page === "models" && <ModelsPage />}
        {page === "pre-prompts" && <PrePromptsPage />}
        {page === "author" && <AuthorPage />}
        {page === "labels" && <LabelsPage />}
        {page === "checkout" && <CheckoutPage />}
      </div>
    </section>
  );
}
