/**
 * Clearance for the macOS traffic lights, which AppKit draws over our top-left:
 * tauri.conf.json sets `titleBarStyle: "Overlay"` with `hiddenTitle: true`, so
 * this strip IS the title bar and the window is named once, here. The keys are
 * macOS-only — Windows and Linux keep their native bar above this strip and
 * reserve no gutter. (Same treatment as configr's AppHeader.)
 */
const TRAFFIC_LIGHT_GUTTER = "pl-[78px]";

const hasOverlayTitleBar = (): boolean => navigator.userAgent.includes("Mac OS X");

/**
 * The window's identity strip, and nothing else — the workspace controls live
 * in the explorer (add in its header, git status / theme / switch repo in its
 * footer), exactly as configr keeps its title bar empty.
 */
export function AppHeader() {
  return (
    <header
      data-tauri-drag-region
      // Pixel height on purpose: the fluid root font size scales rem chrome on
      // wide screens, and the title bar must stay level with the traffic lights.
      className={`flex h-[36px] shrink-0 items-center border-b border-border bg-card text-xs ${hasOverlayTitleBar() ? TRAFFIC_LIGHT_GUTTER : "pl-3"}`}
    >
      <span className="pointer-events-none inline-flex items-center font-bold">
        <span className="glow text-primary">seedr-studio</span>
        <span className="cursor-block ml-2" aria-hidden="true" />
      </span>
    </header>
  );
}
