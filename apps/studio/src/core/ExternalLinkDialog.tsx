import { useEffect, useRef } from "react";
import { useExternalLink } from "./externalUrl";

/**
 * The stop before the system browser: every external link in the app requests
 * through `useExternalLink`, and nothing opens until it is confirmed here.
 */
export function ExternalLinkDialog() {
  const pending = useExternalLink((s) => s.pending);
  const confirm = useExternalLink((s) => s.confirm);
  const cancel = useExternalLink((s) => s.cancel);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, cancel]);

  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md" role="presentation" onClick={cancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="open in browser"
        className="card-terminal w-full max-w-xl text-xs"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="prompt">open in your browser?</p>
        <p className="mt-3 break-all text-muted-foreground">{pending}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => void confirm()} className="btn-terminal btn-terminal--compact">
            open
          </button>
          <button ref={cancelRef} type="button" onClick={cancel} className="btn-terminal btn-terminal--ghost btn-terminal--compact">
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}
