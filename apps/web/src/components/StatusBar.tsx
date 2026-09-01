import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Circle } from "lucide-react";
import { setAnimationEnabled, useAnimationEnabled } from "@/lib/animationPreference";

const THEMES = ["warm", "green", "mono", "paper"] as const;
type Theme = (typeof THEMES)[number];

const THEME_BACKGROUNDS: Record<Theme, string> = {
  warm: "#f5efe2",
  green: "#020604",
  mono: "#050505",
  paper: "#fafafa",
};

function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme as Theme | undefined;
  return theme && THEMES.includes(theme) ? theme : "warm";
}

export function StatusBar() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const anim = useAnimationEnabled();
  const { pathname } = useLocation();
  const themeDropdownRef = useRef<HTMLDetailsElement>(null);

  // The theme menu is the design system's details.dropdown: the panel is
  // positioned in document flow, so it stays put under the resolution zoom
  // (html { zoom }) that throws Radix's measured popper coordinates off-screen
  // on >1920px windows. Native <details> handles open/close; this effect adds
  // the click-away and Escape dismissal the design runtime provides on static
  // pages.
  useEffect(() => {
    const dropdown = themeDropdownRef.current;
    if (!dropdown) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (dropdown.open && event.target instanceof Node && !dropdown.contains(event.target)) {
        dropdown.removeAttribute("open");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dropdown.removeAttribute("open");
    };
    document.addEventListener("click", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const applyTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode */
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_BACKGROUNDS[next]);
    document.getElementById("favicon")?.setAttribute("href", `/favicon-${next}.svg`);
    setTheme(next);
  };

  // Animations on/off — mirrors pagr's footer toggle. Takes effect immediately:
  // the terminal session re-arms (or stops) without a reload, and the choice is
  // persisted in localStorage "anim" for the pre-paint gate in index.html.
  const toggleAnim = () => setAnimationEnabled(!anim);

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card text-[11px]" data-testid="status-bar">
      {/* wraps onto two rows on phones: the path collapses first, the controls never clip */}
      <div className="mx-auto flex min-h-8 w-full max-w-[var(--content-w)] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1">
        <span className="min-w-0 flex-1 basis-full truncate text-muted-foreground sm:basis-auto" data-testid="status-path">
          <span className="text-primary">[seedr]</span> visitor@registry:
          <span className="text-foreground">{`~/.agents${pathname === "/" ? "" : pathname}`}</span>
        </span>
        <nav className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-6" aria-label="Site">
          <Link to="/privacy" className="link-quiet no-underline!">
            privacy
          </Link>
          <Link to="/impressum" className="link-quiet no-underline!">
            impressum
          </Link>
          <span className="h-3.5 w-px bg-border" aria-hidden />
          <details ref={themeDropdownRef} className="dropdown" data-testid="theme-picker">
            <summary aria-label={`Theme: ${theme}`}>
              <span className="visually-hidden">theme </span>
              <Circle className="size-3" fill="currentColor" />
              <span>{theme}</span>
              <span aria-hidden>▾</span>
            </summary>
            <ul className="dropdown-panel" role="list">
              {THEMES.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    className="dropdown-item"
                    data-theme-value={t}
                    onClick={() => {
                      applyTheme(t);
                      themeDropdownRef.current?.removeAttribute("open");
                    }}
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <button
            type="button"
            onClick={toggleAnim}
            aria-pressed={anim}
            aria-label="Animations"
            title="Toggle animations"
            data-testid="anim-toggle"
            className="flex cursor-pointer items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
          >
            <span aria-hidden className={anim ? "text-primary" : undefined}>
              {anim ? "[x]" : "[ ]"}
            </span>
            <span>anim</span>
          </button>
        </nav>
      </div>
    </footer>
  );
}
