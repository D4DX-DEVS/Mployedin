"use client";

import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import { formatNumber } from "@/lib/formatNumber";

export interface StatusFilterItem {
  id: string;
  label: string;
  value: number;
}

interface StatusFilterStripProps {
  label: string;
  items: StatusFilterItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

/** Compact, touch-safe portfolio navigation for mobile-first list pages. */
export function StatusFilterStrip({ label, items, selectedId, onSelect, className }: StatusFilterStripProps) {
  const locale = useParams<{ locale?: string }>()?.locale ?? "en";

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("grid overflow-hidden rounded-xl border border-border bg-border/70", className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-center justify-center bg-background px-1.5 py-2 text-center transition-colors",
              "focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              selected ? "bg-primary/[0.08] text-primary" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            )}
          >
            <span className="text-lg font-semibold leading-none tabular-nums text-foreground">{formatNumber(item.value, locale)}</span>
            <span className="mt-1 w-full text-[11px] font-semibold uppercase leading-3 tracking-[0.08em] [overflow-wrap:anywhere] sm:text-[11px]">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
