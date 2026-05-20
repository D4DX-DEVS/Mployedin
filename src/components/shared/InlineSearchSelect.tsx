"use client";

import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Search, Loader2 } from "lucide-react";

export interface InlineSelectOption {
  value: string;
  label: string;
}

interface InlineSearchSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: InlineSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function InlineSearchSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  disabled = false,
  loading = false,
}: InlineSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabel = options.find((o) => o.value === value)?.label;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(!open); setQuery(""); } }}
        className="flex h-10 w-full items-center justify-between gap-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm shadow-sm shadow-black/[0.04] transition-all duration-200 hover:border-border focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selectedLabel ? "truncate text-left" : "truncate text-left text-muted-foreground"}>
          {loading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </span>
          ) : (
            selectedLabel ?? placeholder
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-40" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-[200px] rounded-xl border border-border/50 bg-popover shadow-lg shadow-black/[0.08] animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          {options.length > 4 && (
            <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1 scrollbar-none">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">No results found</div>
            ) : (
              filtered.map((opt) => {
                const isActive = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onValueChange(opt.value); setOpen(false); setQuery(""); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-100 ${
                      isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent/40 text-foreground"
                    }`}
                  >
                    <Check className={`h-3.5 w-3.5 shrink-0 ${isActive ? "opacity-100 text-primary" : "opacity-0"}`} />
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}