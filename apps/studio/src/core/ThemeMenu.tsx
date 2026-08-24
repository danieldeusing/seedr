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
  const panelSide = align === "left" ? "left-0" : "right-0";
  const panelEdge = direction === "up" ? "bottom-full mb-2" : "top-full mt-2";
  return (
    <details className="dropdown relative">
      <summary aria-label={`theme: ${theme}`} data-tip="Switch the estate colour theme" className="flex h-7 w-9 cursor-pointer list-none items-center justify-center gap-0.5 border border-neutral-500/30 text-neutral-400 transition-colors hover:border-neutral-500/40 hover:bg-neutral-500/20 hover:text-neutral-300">
        <Palette className="size-3.5" aria-hidden="true" />
        <Chevron className="size-3" aria-hidden="true" />
      </summary>
      <div className={`absolute ${panelSide} ${panelEdge} z-[9999] overflow-hidden border border-neutral-600 bg-[var(--popover)] py-1 whitespace-nowrap shadow-xl`} role="menu" aria-label="theme">
        {THEMES.map((option) => (
          <button key={option} type="button" role="menuitem" className={`flex w-full cursor-pointer items-center gap-2 px-4 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700 ${option === theme ? "bg-violet-500/20 text-neutral-200" : "text-neutral-400"}`} aria-current={option === theme ? "true" : undefined} onClick={choose(option)}>
            <span
              aria-hidden="true"
              className="inline-block size-2.5 shrink-0 rounded-full border"
              style={{ backgroundColor: SWATCHES[option].bg, borderColor: SWATCHES[option].accent }}
            />
            {option}
          </button>
        ))}
      </div>
    </details>
  );
}
