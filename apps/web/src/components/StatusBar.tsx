import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Circle } from "lucide-react";

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

function animEnabled(): boolean {
  if (typeof document === "undefined") return true;
  return !document.documentElement.classList.contains("anim-off");
}

export function StatusBar() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [anim, setAnim] = useState<boolean>(animEnabled);
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

  // Animations on/off — mirrors pagr's footer toggle. Turning off marks html.anim-off
  // (the design system's CSS then kills every keyframe) and persists localStorage "anim",
  // which the terminal session reads pre-paint so the choice sticks across loads.
  const toggleAnim = () => {
    const html = document.documentElement;
    const turningOff = !html.classList.contains("anim-off");
    if (turningOff) {
      html.classList.add("anim-off");
      html.classList.remove("term-anim");
    } else {
      html.classList.remove("anim-off");
    }
    try {
      localStorage.setItem("anim", turningOff ? "off" : "on");
    } catch {
      /* private mode */
    }
    setAnim(!turningOff);
  };

  return (
    <footer className="fixed bottom-0 inset-x-0 z-50 h-8 border-t border-border bg-card text-[11px]">
      <div className="h-full px-4 flex items-center justify-between gap-4">
        <span className="text-muted-foreground truncate">
          <span className="text-primary">[seedr]</span> visitor@registry:
          <span className="text-foreground">{`~/.agents${pathname === "/" ? "" : pathname}`}</span>
        </span>
        <nav className="flex items-center gap-6 shrink-0">
          <Link to="/privacy" className="link-quiet no-underline!">
            privacy
          </Link>
          <Link to="/impressum" className="link-quiet no-underline!">
            impressum
          </Link>
          <span className="h-3.5 w-px bg-border" aria-hidden />
          <details ref={themeDropdownRef} className="dropdown">
            <summary>
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
            title="Toggle animations"
            className="flex cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors outline-none"
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
