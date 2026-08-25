import { useEffect, useRef, useState } from "react";
import { listSkills, type SkillEntry } from "@/api/skills";

/**
 * The word being typed when the caret sits in a `/name` token — the token must
 * start a line or follow whitespace, so a path like `a/b` never opens the list.
 * Returns the token's bounds so an accepted skill replaces exactly it.
 */
export function slashToken(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const slash = before.lastIndexOf("/");
  if (slash === -1) return null;
  const preceding = slash === 0 ? "" : before[slash - 1];
  if (preceding && !/\s/.test(preceding)) return null;
  const query = before.slice(slash + 1);
  return /\s/.test(query) ? null : { query, start: slash };
}

export const matchSkills = (skills: SkillEntry[], query: string): SkillEntry[] => {
  const needle = query.toLowerCase();
  return skills.filter((skill) => skill.name.toLowerCase().includes(needle)).slice(0, 8);
};

interface PromptFieldProps {
  id: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A prompt textarea that knows this machine's skills: typing `/` offers them,
 * arrows and Enter choose one, Escape dismisses. Everything else is a textarea —
 * the list never rewrites what was typed on its own.
 */
export function PromptField({ id, value, onChange, placeholder, disabled = false, className = "" }: PromptFieldProps) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [token, setToken] = useState<{ query: string; start: number } | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void listSkills()
      .then(setSkills)
      .catch(() => setSkills([]));
  }, []);

  const matches = token ? matchSkills(skills, token.query) : [];
  const open = matches.length > 0;

  const sync = (element: HTMLTextAreaElement) => {
    setToken(slashToken(element.value, element.selectionStart));
    setHighlighted(0);
  };

  const accept = (skill: SkillEntry) => {
    if (!token) return;
    const element = ref.current;
    const caret = element?.selectionStart ?? value.length;
    onChange(`${value.slice(0, token.start)}/${skill.name} ${value.slice(caret)}`);
    setToken(null);
    element?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      const skill = matches[highlighted];
      if (!skill) return;
      event.preventDefault();
      accept(skill);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setToken(null);
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={ref}
        id={id}
        className={className}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          sync(event.target);
        }}
        onClick={(event) => sync(event.currentTarget)}
        onKeyUp={(event) => {
          // While the list is open the vertical arrows moved the highlight, not
          // the caret — re-reading the token here would reset the highlight.
          const movedHighlight = open && (event.key === "ArrowDown" || event.key === "ArrowUp");
          if (!movedHighlight && (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End")) sync(event.currentTarget);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setToken(null)}
      />
      {open && (
        <ul
          role="listbox"
          aria-label="skills"
          className="absolute top-full right-0 left-0 z-[9999] max-h-56 overflow-y-auto border border-neutral-600 bg-[var(--popover)] shadow-lg"
        >
          {matches.map((skill, index) => (
            <li key={`${skill.scope}/${skill.name}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                // The textarea's blur would close the list before a click lands.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => accept(skill)}
                className={`flex w-full cursor-pointer items-baseline gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  index === highlighted ? "bg-violet-600/20 text-neutral-200" : "text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                <span className="shrink-0">/{skill.name}</span>
                <span className="truncate text-neutral-500">{skill.description}</span>
                {skill.scope === "user" && <span className="ml-auto shrink-0 text-neutral-600">user</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
