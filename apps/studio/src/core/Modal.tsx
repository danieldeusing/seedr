import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose(): void;
  /** lg for forms, full for the workspace-sized panes (git, update with files). */
  size?: "lg" | "full";
  children: ReactNode;
}

/**
 * The one dialog frame (configr's Modal, in estate clothes): a dimmed backdrop,
 * a centered card, a named header with the close control. Escape and the
 * backdrop both dismiss — a dialog the user cannot leave is a trap, so closing
 * is always available; the stores keep their own state across it.
 */
export function Modal({ title, onClose, size = "lg", children }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/60 p-6 backdrop-blur-md" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={`flex min-h-0 flex-col overflow-hidden border border-primary/40 bg-card shadow-[0_0_40px_var(--glow-soft)] ${size === "full" ? "h-[88vh] w-[86vw] max-w-[1400px]" : "max-h-[85vh] w-full max-w-3xl"}`}
      >
        <div className="flex h-[36px] shrink-0 items-center gap-2 border-b border-border px-4">
          <p className="prompt min-w-0 flex-1 truncate text-xs">{title}</p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={`close ${title}`} className="text-muted-foreground hover:text-primary">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
