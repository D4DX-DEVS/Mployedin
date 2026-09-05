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
  /** Accessible name for the combobox trigger. Falls back to placeholder. */
  ariaLabel?: string;
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
  /** Override max-height on the options list (default: max-h-[300px]) */
  listClassName?: string;
  /** Content rendered below the list (e.g. result count) */
  footerContent?: React.ReactNode;
  /**
   * Show the search box. Left unset, it appears only when the list is long
   * enough to be worth filtering (or when search is controlled by the caller,
   * i.e. results come from the server). Short lists — sort orders, status
   * filters — get a plain menu instead of a search field nobody types in.
   */
  searchable?: boolean;
}

/** Below this many options, scrolling beats typing — hide the search box. */
const SEARCH_THRESHOLD = 8;

export function SearchableSelect({
  options,
  value,
  onValueChange,
  searchValue,
  onSearchValueChange,
  placeholder = "Select…",
  ariaLabel,
  searchPlaceholder = "Search…",
  disabled = false,
  className,
  emptyMessage = "No results found.",
  loading = false,
  loadingMessage = "Searching…",
  id,
  container,
  modal: modalProp = false,
  listClassName,
  footerContent,
  searchable,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [internalSearchValue, setInternalSearchValue] = React.useState("");
  const selectedLabel = options.find((o) => o.value === value)?.label;
  const triggerLabel = selectedLabel || placeholder;
  const isSearchControlled = searchValue !== undefined;
  const resolvedSearchValue = isSearchControlled ? searchValue : internalSearchValue;
  const showSearch = searchable ?? (isSearchControlled || options.length >= SEARCH_THRESHOLD);

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
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          className={cn(
            // Phones fit three of these on one filter row, so the trigger gives
            // up padding and type size rather than truncating its label.
            "flex h-9 w-full min-w-0 items-center gap-1 rounded-lg border border-border/60 bg-background px-2 py-1 text-[11px] shadow-sm shadow-black/[0.04] transition-all duration-200 hover:border-border focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50",
            "sm:h-10 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm",
            className
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-start",
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
        avoidCollisions
        collisionPadding={8}
        style={{
          width: "max-content",
          minWidth: "var(--radix-popover-trigger-width)",
          maxWidth: "min(28rem, calc(100vw - 2rem))",
        }}
      >
        <Command>
          {/* Kept mounted when hidden: cmdk routes arrow/enter keys through the
              focused input, so removing it would break keyboard navigation. */}
          <div className={cn(!showSearch && "sr-only")}>
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-9 searchable-select-search"
              value={resolvedSearchValue}
              onValueChange={handleSearchValueChange}
            />
          </div>
          <CommandList className={cn("max-h-[300px] overflow-y-auto", listClassName)}>
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
                      "me-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {footerContent}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
