import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Circle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/DropdownMenu";

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
  const { pathname } = useLocation();

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

  return (
    <footer className="fixed bottom-0 inset-x-0 z-50 h-8 border-t border-border bg-card text-[12px]">
      <div className="h-full px-4 flex items-center justify-between gap-4">
        <span className="text-muted-foreground truncate">
          <span className="text-primary">[seedr]</span> visitor@registry:
          <span className="text-foreground">{`~/.agents${pathname === "/" ? "" : pathname}`}</span>
        </span>
        <nav className="flex items-center gap-10 shrink-0">
          <Link to="/privacy" className="link-quiet no-underline hover:underline">
            privacy
          </Link>
          <Link to="/impressum" className="link-quiet no-underline hover:underline">
            impressum
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors outline-none">
              <Circle className="size-3" fill="currentColor" />
              <span>{theme}</span>
              <span aria-hidden>▾</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              {THEMES.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={() => applyTheme(t)}
                  className={t === theme ? "text-primary" : undefined}
                >
                  {t}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </footer>
  );
}
