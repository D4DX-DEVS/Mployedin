import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CountCardItem {
  label: ReactNode;
  value: ReactNode;
}

interface CountCardGridProps {
  items: readonly CountCardItem[];
  className?: string;
}

/**
 * Shared compact count/detail row used inside dashboard list cards.
 * Inline label/value pairs — boxed cells cost ~40px of card height each row
 * for three tiny values, which capped how many list items fit per viewport.
 */
export function CountCardGrid({ items, className }: CountCardGridProps) {
  return (
    <dl className={cn("flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex min-w-0 items-baseline gap-1.5">
          <dt className="text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] text-muted-foreground [overflow-wrap:anywhere]">
            {item.label}
          </dt>
          <dd className="truncate text-xs font-semibold tabular-nums text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
