import { Link, useLocation } from "react-router-dom";
// toolr-design-ignore-next-line
import { Github } from "lucide-react";
import { ToolrAppLogo, IconButton, NavigationBar } from "@toolr/ui-design";
import { useNavigation } from "@/contexts/NavigationContext";

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
    <header className="h-[48px] border-b border-overlay bg-neutral-950 px-4">
      <div className="h-full flex items-center">
        {/* Left: Logo (takes remaining space) */}
        <div className="flex-1 flex items-center">
          <Link
            to="/"
            className="group flex items-center gap-2 transition-all"
          >
            <ToolrAppLogo
              app="seedr"
              size={28}
              className="group-hover:opacity-80 transition-opacity"
            />
            <div className="flex flex-col">
              <span className="text-md font-medium text-text tracking-tight group-hover:text-green-300 transition-colors leading-none">
                Seedr
              </span>
              <span className="text-sm text-text-dim tracking-wide uppercase leading-none mt-0.5">
                by Daniel Deusing
              </span>
            </div>
          </Link>
        </div>

        {/* Center: NavigationBar with same max-w as page content */}
        {!isHome && (
          <div className="w-full max-w-6xl px-4">
            <NavigationBar
              layout="header"
              segments={segments}
              onBack={goBack}
              onForward={goForward}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              showHistory
              historyEntries={historyEntries}
              currentHistoryIndex={currentHistoryIndex}
              onHistorySelect={goToHistory}
              accentColor="neutral"
            />
          </div>
        )}

        {/* Right: External links (takes remaining space) */}
        <div className="flex-1 flex items-center justify-end gap-2">
          <IconButton
            icon={<Github className="w-4 h-4" />}
            href="https://github.com/danieldeusing/seedr"
            size="sm"
            accentColor="neutral"
            tooltip={{ description: "View source code" }}
            tooltipPosition="bottom"
          />
        </div>
      </div>
    </header>
  );
}
