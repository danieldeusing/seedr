import { Search, X } from "lucide-react";

interface InputProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  ariaLabel: string;
  /** Renders the leading glass and a clear control. */
  search?: boolean;
  variant?: "filled" | "outline";
  disabled?: boolean;
}

/**
 * configr's Input, size sm: `px-2 py-1 text-sm`, `text-neutral-200
 * placeholder-neutral-500`, violet (accent) border family, filled sits on
 * neutral-960. The search shape gets the glass at left-2.5 and a clear button.
 */
export function Input({ value, onChange, placeholder, ariaLabel, search = false, variant = "outline", disabled = false }: InputProps) {
  return (
    <div className="relative min-w-0 flex-1">
      {search && <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 z-10 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />}
      <input
        type={search ? "search" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={`w-full border px-2 py-1 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-violet-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${variant === "filled" ? "bg-neutral-960" : "bg-transparent"} border-violet-500/30 ${search ? "pr-8 pl-8" : ""}`}
      />
      {search && value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="clear search"
          className="absolute top-1/2 right-2 z-10 flex h-[18px] w-[18px] -translate-y-1/2 cursor-pointer items-center justify-center text-neutral-400 transition-colors hover:bg-neutral-500/20 hover:text-neutral-300"
        >
          <X className="h-2.5 w-2.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
