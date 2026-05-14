"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  id?: string;
  /** Portal container — pass a ref to the dialog content to render inside dialogs */
  container?: HTMLElement | null;
  /** When true, Popover traps focus/pointer events — fixes click interception inside dialogs */
  modal?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  searchValue,
  onSearchValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled = false,
  className,
  emptyMessage = "No results found.",
  loading = false,
  loadingMessage = "Searching…",
  id,
  container,
  modal: modalProp = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [internalSearchValue, setInternalSearchValue] = React.useState("");
  const selectedLabel = options.find((o) => o.value === value)?.label;
  const triggerLabel = selectedLabel || placeholder;
  const isSearchControlled = searchValue !== undefined;
  const resolvedSearchValue = isSearchControlled ? searchValue : internalSearchValue;

  const handleSearchValueChange = React.useCallback((nextValue: string) => {
    if (!isSearchControlled) {
      setInternalSearchValue(nextValue);
    }

    onSearchValueChange?.(nextValue);
  }, [isSearchControlled, onSearchValueChange]);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      return;
    }

    if (isSearchControlled) {
      onSearchValueChange?.("");
      return;
    }

    setInternalSearchValue("");
  }, [isSearchControlled, onSearchValueChange]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={modalProp}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm shadow-sm shadow-black/[0.04] transition-all duration-200 hover:border-border focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              !selectedLabel && "text-muted-foreground"
            )}
          >
            {triggerLabel}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-testid="searchable-select-content"
        className="p-0 z-[10001]"
        align="start"
        sideOffset={4}
        container={container}
        style={{
          width: "max-content",
          minWidth: "var(--radix-popover-trigger-width)",
          maxWidth: "min(24rem, calc(100vw - 2rem))",
        }}
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-9"
            value={resolvedSearchValue}
            onValueChange={handleSearchValueChange}
          />
          <CommandList>
            <CommandEmpty>{loading ? loadingMessage : emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value);
                    handleOpenChange(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
