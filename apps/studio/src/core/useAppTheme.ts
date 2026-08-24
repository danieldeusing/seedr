import { useEffect, useState } from "react";

export type AppTheme = "warm" | "green" | "mono" | "paper";

const THEMES: AppTheme[] = ["warm", "green", "mono", "paper"];

function readTheme(): AppTheme {
  const theme = document.documentElement.dataset.theme as AppTheme | undefined;
  return theme && THEMES.includes(theme) ? theme : "warm";
}

/** Current app theme, kept in sync with the html element's data-theme attribute. */
export function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>(readTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
