/**
 * Clearance for the macOS traffic lights, which AppKit draws over our top-left:
 * tauri.conf.json sets `titleBarStyle: "Overlay"` with `hiddenTitle: true`, so
 * this strip IS the title bar and the window is named once, here. The keys are
 * macOS-only — Windows and Linux keep their native bar above this strip and
 * reserve no gutter. (Same treatment as configr's AppHeader.)
 */
const TRAFFIC_LIGHT_GUTTER = "pl-[78px]";

const hasOverlayTitleBar = (): boolean => navigator.userAgent.includes("Mac OS X");

interface AppHeaderProps {
  onAddCapability(): void;
  onGitStatus(): void;
  onSwitchRepo(): void;
}

/** The window's identity strip: the wordmark and the app-wide controls. */
export function AppHeader({ onAddCapability, onGitStatus, onSwitchRepo }: AppHeaderProps) {
  return (
    <header
      // An overlay title bar hands window dragging to the markup. Tauri reads the
      // attribute off the event target itself, so text is made non-targetable and
      // the buttons keep their own clicks by simply not carrying the attribute.
      data-tauri-drag-region
      // Pixel height on purpose: the fluid root font size scales rem chrome on
      // wide screens, and the title bar must stay level with the traffic lights.
      className={`flex h-[36px] shrink-0 items-center gap-3 border-b border-border bg-card pr-3 text-xs ${hasOverlayTitleBar() ? TRAFFIC_LIGHT_GUTTER : "pl-3"}`}
    >
      <span className="pointer-events-none inline-flex items-center font-bold">
        <span className="glow text-primary">seedr-studio</span>
        <span className="cursor-block ml-2" aria-hidden="true" />
      </span>
      <span className="flex-1" data-tauri-drag-region />
      <button type="button" onClick={onAddCapability} className="btn-terminal btn-terminal--ghost btn-terminal--compact">
        add capability
      </button>
      <button type="button" onClick={onGitStatus} className="btn-terminal btn-terminal--ghost btn-terminal--compact">
        git status
      </button>
      <button
        type="button"
        onClick={onSwitchRepo}
        data-tip="Point Studio at another seedr checkout — e.g. a private fork of the registry"
        className="btn-terminal btn-terminal--ghost btn-terminal--compact"
      >
        switch repo
      </button>
    </header>
  );
}
