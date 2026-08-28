import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./ui/IconButton";

interface ModalProps {
  title: string;
  onClose(): void;
  /**
   * lg for forms, xl for wider ones, full for the workspace-sized panes, and
   * `tall` for a wide panel that is only as tall as it needs to be — a form that
   * grows a log while it runs, and should not reserve the room beforehand.
   */
  size?: "lg" | "xl" | "full" | "tall";
  children: ReactNode;
}

// Every size stops at the viewport: a panel taller than the screen is centred
// past both edges, and its own scroll area never engages because the panel grew
// with the content instead of holding it.
const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  lg: "max-w-2xl w-full mx-4 max-h-[90vh]",
  xl: "max-w-4xl w-full mx-4 max-h-[90vh]",
  full: "w-[80vw] max-w-[1440px] h-[90vh]",
  // `max-h`, not `h`: full's fixed height left the add dialog holding most of a
  // screen of nothing until an agent started writing into it.
  tall: "w-[80vw] max-w-[1440px] max-h-[90vh]",
};

/**
 * configr's Modal, in shared clothes: a black rgba(0,0,0,.5) scrim with blur
 * in every theme (--dialog-backdrop), the panel on neutral-980 with a
 * neutral-700 edge, the header a faint neutral-960 hairline with an 18px
 * semibold title and the neutral × IconButton. Escape and the backdrop both
 * dismiss; the stores keep their own state across it.
 */
export function Modal({ title, onClose, size = "lg", children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus once, on open. Tied to `onClose` it re-ran whenever a caller passed a
  // fresh arrow — which is every render — and pulled focus out of whatever the
  // dialog contains after each keystroke.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={title} ref={dialogRef} tabIndex={-1}>
      <div className="absolute inset-0 bg-[var(--dialog-backdrop)] backdrop-blur-sm" onClick={onClose} />
      <div className={`relative flex min-h-0 flex-col overflow-hidden border border-neutral-700 bg-neutral-980 shadow-2xl ${SIZE_CLASSES[size]}`}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-neutral-960 px-6 py-4">
          <h3 className="min-w-0 flex-1 truncate text-lg font-semibold text-white">{title}</h3>
          <IconButton icon={X} ariaLabel={`close ${title}`} onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
