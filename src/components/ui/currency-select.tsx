"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SUPPORTED_CURRENCIES, type CurrencyInfo } from "@/lib/currency";

interface CurrencySelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CurrencySelect({
  value,
  onValueChange,
  placeholder = "Select currency…",
  disabled = false,
  className,
}: CurrencySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = SUPPORTED_CURRENCIES.find((c) => c.code === value);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return SUPPORTED_CURRENCIES;
    const q = search.toLowerCase();
    return SUPPORTED_CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [search]);

  React.useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          {selected ? (
            <CurrencyBadge currency={selected} />
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-40" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 overflow-hidden z-[10001]"
        align="start"
        sideOffset={6}
        style={{
          width: "max-content",
          minWidth: "var(--radix-popover-trigger-width)",
          maxWidth: "min(26rem, calc(100vw - 2rem))",
        }}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search currency or country…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {/* List */}
        <div className="max-h-[280px] overflow-y-auto overscroll-contain p-1.5">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No currency found.
            </p>
          ) : (
            filtered.map((c) => {
              const isSelected = value === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onValueChange(c.code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    isSelected
                      ? "bg-primary/8 text-primary"
                      : "text-foreground hover:bg-accent/50"
                  )}
                >
                  {/* Symbol badge */}
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
                      isSelected
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/60 text-muted-foreground"
                    )}
                  >
                    {c.symbol.length <= 3 ? c.symbol : c.code.slice(0, 2)}
                  </span>

                  {/* Code + label */}
                  <div className="flex flex-col items-start min-w-0">
                    <span className="font-medium leading-tight">{c.code}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {c.label}
                    </span>
                  </div>

                  {/* Check */}
                  {isSelected && (
                    <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Compact inline badge for the trigger */
function CurrencyBadge({ currency }: { currency: CurrencyInfo }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
        {currency.symbol.length <= 3 ? currency.symbol : currency.code.slice(0, 2)}
      </span>
      <span className="font-medium">{currency.code}</span>
      <span className="text-muted-foreground truncate">— {currency.label}</span>
    </span>
  );
}
