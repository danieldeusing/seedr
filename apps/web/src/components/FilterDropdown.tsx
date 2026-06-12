import { Check, ChevronDown, Filter, X } from "lucide-react";

import { Button } from "./ui/Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/DropdownMenu";
import { cn } from "@/lib/utils";

export interface FilterDropdownProps {
  /** Current value. Empty string or "all" means no filter is active. */
  value: string;
  /** Delivers the selected value directly; empty string when cleared. */
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Label shown on the trigger when no filter is active. */
  allLabel: string;
}

export function FilterDropdown({ value, onChange, options, allLabel }: FilterDropdownProps) {
  const isActive = value !== "" && value !== "all";
  const selectedLabel = isActive
    ? (options.find((option) => option.value === value)?.label ?? value)
    : allLabel;

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            className={cn("group h-7", isActive && "border-primary text-primary")}
          >
            <Filter className="size-3" />
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onChange("")}>
            <Check className={cn("size-3", isActive && "invisible")} />
            All
          </DropdownMenuItem>
          {options.map((option) => (
            <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)}>
              <Check className={cn("size-3", value !== option.value && "invisible")} />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {isActive && (
        <Button
          variant="outline"
          size="icon-xs"
          className="-ml-px h-7"
          aria-label="Clear filter"
          onClick={() => onChange("")}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
