import { useState } from "react";
import { ChevronDown, ChevronUp, Palette } from "lucide-react";

const THEMES = ["warm", "green", "mono", "paper"] as const;
type Theme = (typeof THEMES)[number];

// Swatch tiles name a THING (a theme's own ground and accent), not a state, so
// the values are the themes' literal colours — the same exemption as configr's
// theme swatches and cockpit's vendor colours.
const SWATCHES: Record<Theme, { bg: string; accent: string }> = {
  warm: { bg: "#f5efe2", accent: "#8a4516" },
  green: { bg: "#020604", accent: "#33ff66" },
  mono: { bg: "#050505", accent: "#ffffff" },
  paper: { bg: "#fafafa", accent: "#000000" },
};

const currentTheme = (): Theme => {
  const theme = document.documentElement.dataset.theme as Theme | undefined;
  return theme && THEMES.includes(theme) ? theme : "warm";
};

/**
 * The estate theme picker as a dropdown menu (configr keeps it in the explorer
 * footer); index.html applies the stored choice before first paint.
 */
export function ThemeMenu({ direction = "down", align = "right" }: { direction?: "up" | "down"; align?: "left" | "right" }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const choose = (next: Theme) => (event: React.MouseEvent<HTMLButtonElement>) => {
    document.documentElement.dataset.theme = next;
    try {
      // window-qualified: the bare global can resolve to Node's own localStorage under test
      window.localStorage.setItem("theme", next);
    } catch {
      // storage unavailable: the choice still holds for this session
    }
    setTheme(next);
    event.currentTarget.closest("details")?.removeAttribute("open");
  };

  const Chevron = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <details className={`dropdown ${align === "left" ? "dropup-left" : ""}`}>
      <summary aria-label={`theme: ${theme}`} data-tip="Switch the estate colour theme" className="btn-terminal btn-terminal--ghost btn-terminal--compact">
        <Palette className="size-3.5" aria-hidden="true" />
        <Chevron className="size-3" aria-hidden="true" />
      </summary>
      <div className={`dropdown-panel ${direction === "down" ? "dropdown-panel--down" : ""}`} role="menu" aria-label="theme">
        {THEMES.map((option) => (
          <button key={option} type="button" role="menuitem" className="dropdown-item" aria-current={option === theme ? "true" : undefined} onClick={choose(option)}>
            <span
              aria-hidden="true"
              className="mr-2 inline-block size-2.5 border align-middle"
              style={{ backgroundColor: SWATCHES[option].bg, borderColor: SWATCHES[option].accent }}
            />
            {option}
          </button>
        ))}
      </div>
    </details>
  );
}
