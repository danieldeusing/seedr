import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { Github, ChevronLeft, ChevronRight, History } from "lucide-react";
import { useNavigation } from "@/contexts/NavigationContext";
import { Button } from "./ui/Button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/DropdownMenu";

function toPathSegment(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

export function Header() {
  const {
    segments,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    historyEntries,
    currentHistoryIndex,
    goToHistory,
  } = useNavigation();

  const isHome = useLocation().pathname === "/";

  return (
    <header className="h-12 border-b border-border bg-card px-4">
      <div className="h-full flex items-center">
        {/* Left: Logo (takes remaining space) */}
        <div className="flex-1 flex items-center">
          <Link to="/" className="group flex items-center">
            <span className="text-xl font-bold tracking-tight glow">Seedr</span>
            <span className="cursor-block" aria-hidden />
          </Link>
        </div>

        {/* Center: breadcrumb path + history nav */}
        {!isHome && (
          <div className="w-full max-w-6xl px-4 flex items-center gap-1 min-w-0">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={goBack}
              disabled={!canGoBack}
              aria-label="Back"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={goForward}
              disabled={!canGoForward}
              aria-label="Forward"
            >
              <ChevronRight />
            </Button>
            {historyEntries.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="History">
                    <History />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {historyEntries.map((entry, index) => (
                    <DropdownMenuItem
                      key={index}
                      onSelect={() => goToHistory(index)}
                      className={index === currentHistoryIndex ? "text-primary" : undefined}
                    >
                      {entry.map(s => s.label).join(" / ")}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <span className="text-sm truncate ml-3">
              <span className="text-primary">~</span>
              {segments.slice(1).map(segment => (
                <Fragment key={segment.id}>
                  <span className="text-muted-foreground">/</span>
                  {segment.onClick ? (
                    <button
                      onClick={segment.onClick}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      {toPathSegment(segment.label)}
                    </button>
                  ) : (
                    <span className="text-foreground">{toPathSegment(segment.label)}</span>
                  )}
                </Fragment>
              ))}
            </span>
          </div>
        )}

        {/* Right: External links (takes remaining space) */}
        <div className="flex-1 flex items-center justify-end gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" asChild>
                <a
                  href="https://github.com/danieldeusing/seedr"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View source code"
                >
                  <Github />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">View source code</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
