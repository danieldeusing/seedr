import { ArrowDown, ArrowUp, Check, ChevronDown } from "lucide-react";

import { Button } from "./ui/Button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/DropdownMenu";
import { cn } from "@/lib/utils";

export interface SortField {
  value: string;
  label: string;
}

export interface SortDropdownProps {
  field: string;
  ascending: boolean;
  onFieldChange: (field: string) => void;
  onToggleDirection: () => void;
  fields: SortField[];
}

export function SortDropdown({
  field,
  ascending,
  onFieldChange,
  onToggleDirection,
  fields,
}: SortDropdownProps) {
  const currentLabel = fields.find((f) => f.value === field)?.label ?? field;
  const DirectionIcon = ascending ? ArrowUp : ArrowDown;

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="icon-xs"
        className="h-7 text-primary"
        aria-label={ascending ? "Sort descending" : "Sort ascending"}
        onClick={onToggleDirection}
      >
        <DirectionIcon className="size-3" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs" className="group -ml-px h-7">
            <span className="whitespace-nowrap">{currentLabel}</span>
            <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {fields.map((f) => (
            <DropdownMenuItem key={f.value} onSelect={() => onFieldChange(f.value)}>
              <Check className={cn("size-3", field !== f.value && "invisible")} />
              {f.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
