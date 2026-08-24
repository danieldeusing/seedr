import type { LucideIcon } from "lucide-react";
import { Check, X } from "lucide-react";
import { IconButton, type AccentColor } from "./IconButton";

interface FormActionsProps {
  /** Hover text AND accessible name of the confirm control. */
  confirmLabel: string;
  onConfirm(): void;
  confirmIcon?: LucideIcon;
  confirmColor?: AccentColor;
  confirmDisabled?: boolean;
  confirmSpin?: boolean;
  cancelLabel?: string;
  onCancel?(): void;
  /** Muted line at the leading edge (progress, probe state). */
  statusText?: string;
  border?: boolean;
}

/**
 * configr's dialog footer: icon-only actions, right-aligned — × cancels in
 * neutral, ✓ confirms in the accent — with an optional status line leading.
 */
export function FormActions({
  confirmLabel,
  onConfirm,
  confirmIcon = Check,
  confirmColor = "violet",
  confirmDisabled = false,
  confirmSpin = false,
  cancelLabel,
  onCancel,
  statusText,
  border = true,
}: FormActionsProps) {
  return (
    <div className={`flex items-center gap-2 ${statusText ? "justify-between" : "justify-end"} ${border ? "border-t border-neutral-700 px-4 py-3" : "pt-2"}`}>
      {statusText && (
        <span className="min-w-0 truncate text-sm text-neutral-500" role="status">
          {statusText}
        </span>
      )}
      <div className="flex items-center gap-2">
        {onCancel && <IconButton icon={X} ariaLabel={cancelLabel ?? "cancel"} tip={cancelLabel ?? "cancel"} onClick={onCancel} />}
        <IconButton icon={confirmIcon} ariaLabel={confirmLabel} tip={confirmLabel} accentColor={confirmColor} onClick={onConfirm} disabled={confirmDisabled} spin={confirmSpin} />
      </div>
    </div>
  );
}
