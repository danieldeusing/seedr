import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { FormActions } from "./ui/FormActions";
import { useExternalLink } from "./externalUrl";

/**
 * The stop before the system browser: every external link in the app requests
 * through `useExternalLink`, and nothing opens until it is confirmed here.
 */
export function ExternalLinkDialog() {
  const pending = useExternalLink((s) => s.pending);
  const confirm = useExternalLink((s) => s.confirm);
  const cancel = useExternalLink((s) => s.cancel);
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, cancel]);

  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="open in browser">
      <div className="absolute inset-0 bg-[var(--dialog-backdrop)] backdrop-blur-sm" onClick={cancel} />
      <div className="relative mx-4 w-full max-w-md border border-neutral-700 bg-neutral-980 shadow-2xl">
        <div className="border-b border-neutral-960 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Open in your browser?</h3>
        </div>
        <div className="px-6 py-4">
          <p className="break-all text-neutral-300">{pending}</p>
          <FormActions border={false} confirmLabel="open in browser" confirmIcon={ExternalLink} onConfirm={() => void confirm()} cancelLabel="stay here" onCancel={cancel} />
        </div>
      </div>
    </div>
  );
}
