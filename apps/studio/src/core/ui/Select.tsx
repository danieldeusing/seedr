import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Shown but not choosable — the `tip` says why. */
  disabled?: boolean;
  tip?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange(value: T): void;
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  /** Paint the trigger as wrong: the value is refused by something outside it. */
  invalid?: boolean;
}

/**
 * configr's Select, lean: the OS paints a native option list outside the page
 * where no stylesheet reaches, so the trigger is a button and the listbox is
 * our own, portalled to the body on the popover recipe. Keyboard follows the
 * select-only combobox shape: arrows move the highlight, Enter/Space choose,
 * Escape closes, focus never leaves the trigger.
 */
export function Select<T extends string>({ value, options, onChange, ariaLabel, id, disabled = false, invalid = false }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  const openList = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estimatedHeight = options.length * 30 + 10;
    const below = rect.bottom + 4 + estimatedHeight <= window.innerHeight;
    setPosition({ top: below ? rect.bottom + 4 : Math.max(8, rect.top - 4 - estimatedHeight), left: rect.left, width: rect.width });
    setHighlighted(selectedIndex);
    setOpen(true);
  }, [options.length, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!listRef.current?.contains(event.target as Node) && event.target !== triggerRef.current) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "Escape") setOpen(false);
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((current) => {
        let next = current + direction;
        while (options[next]?.disabled) next += direction;
        return options[next] ? next : current;
      });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[highlighted];
      if (option && !option.disabled) {
        onChange(option.value);
        setOpen(false);
      }
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const current = options[selectedIndex];
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex h-7 min-w-40 cursor-pointer items-center gap-1.5 border bg-transparent px-2 text-sm text-neutral-200 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          invalid
            ? "border-destructive hover:bg-destructive/10 focus:border-destructive"
            : "border-violet-500/30 hover:border-violet-500/40 hover:bg-violet-500/20 focus:border-violet-500"
        }`}
      >
        <span className="min-w-0 truncate">{current?.label ?? ""}</span>
        <ChevronDown className={`ml-auto h-3 w-3 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{ top: position.top, left: position.left, minWidth: position.width }}
            className="fixed z-[9999] overflow-hidden border border-neutral-600 bg-[var(--popover)] whitespace-nowrap shadow-lg"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  data-tip={option.tip}
                  onMouseEnter={option.disabled ? undefined : () => setHighlighted(index)}
                  onClick={
                    option.disabled
                      ? undefined
                      : () => {
                          onChange(option.value);
                          setOpen(false);
                          triggerRef.current?.focus();
                        }
                  }
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    option.disabled
                      ? "cursor-not-allowed text-neutral-600"
                      : `cursor-pointer ${index === highlighted || isSelected ? "bg-violet-600/20 text-neutral-200" : "text-neutral-400 hover:bg-neutral-700"}`
                  }`}
                >
                  <Check className={`h-3 w-3 shrink-0 ${isSelected ? "" : "invisible"}`} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
