import { type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";

import { cn } from "../../lib/utils";

interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> {
  value: string;
  /** Delivers the value directly, not the change event. */
  onChange: (value: string) => void;
  type?: "text" | "search";
}

const SEARCH_AUTO_PROPS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

export function Input({ value, onChange, type = "text", className, ...props }: InputProps) {
  const isSearch = type === "search";
  const showClear = isSearch && value !== "";

  return (
    <div className="relative w-full">
      {isSearch && (
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...(isSearch && !props["aria-label"]
          ? { "aria-label": props.placeholder || "Search" }
          : {})}
        {...(isSearch ? SEARCH_AUTO_PROPS : {})}
        className={cn("input w-full", isSearch && "pr-8 pl-8", className)}
        {...props}
      />
      {showClear && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 flex size-[18px] -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
