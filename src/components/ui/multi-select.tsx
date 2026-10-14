"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder: string;
  /** Accessible name for the trigger. Falls back to placeholder. */
  ariaLabel?: string;
  id?: string;
  className?: string;
  /** Portal container — the dialog content, when used inside a dialog. */
  container?: HTMLElement | null;
  modal?: boolean;
}

/**
 * Pick several from a short list. The same trigger as SearchableSelect; the
 * menu stays open while options are ticked, and the trigger lists what is
 * chosen ("Stall, Booth +1").
 */
export function MultiSelect({
  options,
  values,
  onValuesChange,
  placeholder,
  ariaLabel,
  id,
  className,
  container,
  modal = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const chosen = options.filter((option) => values.includes(option.value));
  const summary = chosen.length === 0
    ? null
    : chosen.length <= 2
      ? chosen.map((option) => option.label).join(", ")
      : `${chosen.slice(0, 2).map((option) => option.label).join(", ")} +${chosen.length - 2}`;

  const toggle = (value: string) => {
    onValuesChange(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel ?? placeholder}
          title={chosen.map((option) => option.label).join(", ") || placeholder}
          className={cn(
            "flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm shadow-sm shadow-black/[0.04] transition-all duration-200 hover:border-border focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate text-start", !summary && "text-muted-foreground")}>
            {summary ?? placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-40" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[10001] p-0"
        align="start"
        sideOffset={4}
        container={container}
        avoidCollisions
        collisionPadding={8}
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandList className="max-h-[300px] overflow-y-auto" aria-multiselectable="true">
            <CommandGroup>
              {options.map((option) => {
                const selected = values.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={`option:${option.value}`}
                    aria-checked={selected}
                    data-checked={selected || undefined}
                    onSelect={() => toggle(option.value)}
                  >
                    <span
                      className={cn(
                        "me-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                      aria-hidden="true"
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    {option.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
