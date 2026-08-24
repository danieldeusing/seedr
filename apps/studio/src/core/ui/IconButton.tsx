import type { LucideIcon } from "lucide-react";

/**
 * configr's one and only button: a square, bordered, icon-only control. Text
 * actions are an icon plus a hover (`data-tip`); the accessible name is
 * mandatory. Recipe copied from configr's IconButton.tsx: text -400, idle
 * border -500/30, hover fill -500/20 with border -500/40 and text -300, active
 * is the hover fill made permanent; `filled` sits on neutral-960.
 */
export type AccentColor =
  | "green" | "red" | "blue" | "orange" | "cyan" | "yellow" | "purple" | "indigo"
  | "emerald" | "amber" | "violet" | "neutral" | "sky" | "pink" | "teal";

export type IconButtonSize = "xs" | "sm" | "md";

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  xs: "w-6 h-6",
  sm: "w-7 h-7",
  md: "w-8 h-8",
};

const ICON_SIZE_CLASSES: Record<IconButtonSize, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
};

const COLOR_CLASSES: Record<AccentColor, { text: string; border: string; hover: string; active: string }> = {
  green: { text: "text-green-400", border: "border-green-500/30", hover: "hover:bg-green-500/20 hover:border-green-500/40 hover:text-green-300", active: "bg-green-500/20 text-green-300 border-green-500/40" },
  red: { text: "text-red-400", border: "border-red-500/30", hover: "hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300", active: "bg-red-500/20 text-red-300 border-red-500/40" },
  blue: { text: "text-blue-400", border: "border-blue-500/30", hover: "hover:bg-blue-500/20 hover:border-blue-500/40 hover:text-blue-300", active: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  orange: { text: "text-orange-400", border: "border-orange-500/30", hover: "hover:bg-orange-500/20 hover:border-orange-500/40 hover:text-orange-300", active: "bg-orange-500/20 text-orange-300 border-orange-500/40" },
  cyan: { text: "text-cyan-400", border: "border-cyan-500/30", hover: "hover:bg-cyan-500/20 hover:border-cyan-500/40 hover:text-cyan-300", active: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  yellow: { text: "text-yellow-400", border: "border-yellow-500/30", hover: "hover:bg-yellow-500/20 hover:border-yellow-500/40 hover:text-yellow-300", active: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" },
  purple: { text: "text-purple-400", border: "border-purple-500/30", hover: "hover:bg-purple-500/20 hover:border-purple-500/40 hover:text-purple-300", active: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  indigo: { text: "text-indigo-400", border: "border-indigo-500/30", hover: "hover:bg-indigo-500/20 hover:border-indigo-500/40 hover:text-indigo-300", active: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" },
  emerald: { text: "text-emerald-400", border: "border-emerald-500/30", hover: "hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-300", active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  amber: { text: "text-amber-400", border: "border-amber-500/30", hover: "hover:bg-amber-500/20 hover:border-amber-500/40 hover:text-amber-300", active: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  violet: { text: "text-violet-400", border: "border-violet-500/30", hover: "hover:bg-violet-500/20 hover:border-violet-500/40 hover:text-violet-300", active: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  neutral: { text: "text-neutral-400", border: "border-neutral-500/30", hover: "hover:bg-neutral-500/20 hover:border-neutral-500/40 hover:text-neutral-300", active: "bg-neutral-500/20 text-neutral-300 border-neutral-500/40" },
  sky: { text: "text-sky-400", border: "border-sky-500/30", hover: "hover:bg-sky-500/20 hover:border-sky-500/40 hover:text-sky-300", active: "bg-sky-500/20 text-sky-300 border-sky-500/40" },
  pink: { text: "text-pink-400", border: "border-pink-500/30", hover: "hover:bg-pink-500/20 hover:border-pink-500/40 hover:text-pink-300", active: "bg-pink-500/20 text-pink-300 border-pink-500/40" },
  teal: { text: "text-teal-400", border: "border-teal-500/30", hover: "hover:bg-teal-500/20 hover:border-teal-500/40 hover:text-teal-300", active: "bg-teal-500/20 text-teal-300 border-teal-500/40" },
};

interface IconButtonProps {
  icon: LucideIcon;
  /** The accessible name — mandatory: the control has no text. */
  ariaLabel: string;
  onClick?: () => void;
  /** Hover text; omit when the glyph reads itself (a close ×). */
  tip?: string;
  accentColor?: AccentColor;
  size?: IconButtonSize;
  variant?: "outline" | "filled";
  active?: boolean;
  disabled?: boolean;
  spin?: boolean;
  ariaPressed?: boolean;
}

export function IconButton({
  icon: Icon,
  ariaLabel,
  onClick,
  tip,
  accentColor = "neutral",
  size = "sm",
  variant = "outline",
  active = false,
  disabled = false,
  spin = false,
  ariaPressed,
}: IconButtonProps) {
  const color = COLOR_CLASSES[accentColor];
  const border = variant === "outline" ? color.border : "border-neutral-600";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-tip={tip}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex shrink-0 cursor-pointer items-center justify-center border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variant === "filled" ? "bg-neutral-960" : ""} ${SIZE_CLASSES[size]} ${color.text} ${border} ${active ? color.active : ""} ${!disabled && !active ? color.hover : ""}`}
    >
      <Icon className={`${ICON_SIZE_CLASSES[size]} ${spin ? "animate-spin" : ""}`} aria-hidden="true" />
    </button>
  );
}
