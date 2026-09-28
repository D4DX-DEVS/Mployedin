"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SUPPORTED_CURRENCIES, type CurrencyInfo } from "@/lib/currency";
import { useMasterData } from "@/hooks/useMasterData";
import { useHasQueryClient } from "@/hooks/useHasQueryClient";

interface CurrencySelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the trigger — the visible label sits outside this component. */
  ariaLabel?: string;
  /** Accessible name for the in-popover search box. */
  searchLabel?: string;
}

/**
 * Currency picker fed by the admin-managed `currencies` master list (code,
 * symbol, localised name). `SUPPORTED_CURRENCIES` from `@/lib/currency` is the
 * fallback while loading, on API error, or when no QueryClientProvider is
 * mounted. The stored value is always the ISO 4217 code.
 */
export function CurrencySelect(props: CurrencySelectProps) {
  const hasQueryClient = useHasQueryClient();
  return hasQueryClient ? <LiveCurrencySelect {...props} /> : <CurrencySelectView {...props} currencies={SUPPORTED_CURRENCIES} />;
}

function LiveCurrencySelect(props: CurrencySelectProps) {
  const { options } = useMasterData("currencies", { valueKey: "code" });
  const currencies = React.useMemo<CurrencyInfo[]>(() => {
    if (options.length === 0) return SUPPORTED_CURRENCIES;
    return options.map((o) => ({
      code: o.value,
      symbol: o.item.symbol || o.value,
      label: o.label,
    }));
  }, [options]);
  return <CurrencySelectView {...props} currencies={currencies} />;
}

function CurrencySelectView({
  value,
  onValueChange,
  placeholder = "Select currency…",
  disabled = false,
  className,
  ariaLabel,
  searchLabel,
  currencies,
}: CurrencySelectProps & { currencies: CurrencyInfo[] }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep a stored code visible even if the admin retired it from the list.
  const selected = React.useMemo<CurrencyInfo | undefined>(() => {
    if (!value) return undefined;
    return currencies.find((c) => c.code === value)
      ?? SUPPORTED_CURRENCIES.find((c) => c.code === value)
      ?? { code: value, symbol: value, label: value };
  }, [value, currencies]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return currencies;
    const q = search.toLowerCase();
    return currencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [search, currencies]);

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
          aria-label={ariaLabel}
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
          <ChevronsUpDown className="ms-auto h-4 w-4 shrink-0 opacity-40" />
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
        <div className="relative p-2">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={searchLabel ?? "Search currency or country"}
            placeholder="Search currency or country…"
            className="inline-select-search-input w-full ps-9 pe-3 text-sm outline-none placeholder:text-muted-foreground/50"
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
                    <Check className="ms-auto h-4 w-4 shrink-0 text-primary" />
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
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
        {currency.symbol.length <= 3 ? currency.symbol : currency.code.slice(0, 2)}
      </span>
      <span className="font-medium">{currency.code}</span>
      <span className="text-muted-foreground truncate">— {currency.label}</span>
    </span>
  );
}
