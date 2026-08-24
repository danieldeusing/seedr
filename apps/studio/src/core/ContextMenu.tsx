import { useEffect, useRef, type ReactNode } from "react";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition;
  onClose(): void;
  children: ReactNode;
}

/**
 * A right-click menu on configr's recipe: the popover ground, a neutral-600
 * edge, solid neutral-700 row hover. Closed by click-away, Escape or a choice.
 */
export function ContextMenu({ position, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // Clamp into the viewport so a menu opened near an edge stays reachable.
  const left = Math.min(position.x, window.innerWidth - 240);
  const top = Math.min(position.y, window.innerHeight - 200);

  return (
    <div ref={menuRef} role="menu" style={{ left, top }} className="fixed z-[9999] overflow-hidden border border-neutral-600 bg-[var(--popover)] py-1 whitespace-nowrap shadow-xl">
      {children}
    </div>
  );
}

export function ContextMenuItem({ onSelect, disabled, danger, children }: { onSelect(): void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  const tone = disabled ? "text-neutral-500" : danger ? "text-red-400" : "text-neutral-200";
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm transition-colors focus:outline-none ${disabled ? "cursor-default" : "cursor-pointer hover:bg-neutral-700"} ${tone}`}
    >
      {children}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div role="separator" className="my-1 border-t border-neutral-700" />;
}
