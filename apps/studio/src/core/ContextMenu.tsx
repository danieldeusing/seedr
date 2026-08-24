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

/** A right-click menu: fixed at the pointer, closed by click-away, Escape or any choice. */
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
    <div ref={menuRef} role="menu" style={{ left, top }} className="fixed z-50 min-w-56 border border-border bg-card py-1 text-xs shadow-none">
      {children}
    </div>
  );
}

export function ContextMenuItem({ onSelect, disabled, children }: { onSelect(): void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1 text-left text-foreground hover:bg-muted hover:text-primary disabled:opacity-50"
    >
      {children}
    </button>
  );
}
