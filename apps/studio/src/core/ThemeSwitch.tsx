import { useState } from "react";

const THEMES = ["warm", "green", "mono", "paper"] as const;
type Theme = (typeof THEMES)[number];

const currentTheme = (): Theme => {
  const theme = document.documentElement.dataset.theme as Theme | undefined;
  return theme && THEMES.includes(theme) ? theme : "warm";
};

/** Cycles the estate's four themes; index.html applies the stored one before first paint. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const cycle = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] as Theme;
    document.documentElement.dataset.theme = next;
    try {
      // window-qualified: the bare global can resolve to Node's own localStorage under test
      window.localStorage.setItem("theme", next);
    } catch {
      // storage unavailable: the choice still holds for this session
    }
    setTheme(next);
  };

  return (
    <button type="button" onClick={cycle} className="link-quiet" title="switch theme">
      theme: {theme}
    </button>
  );
}
