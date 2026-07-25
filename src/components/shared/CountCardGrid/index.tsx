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
 * Shared compact count/detail cells used inside dashboard list cards.
 */
export function CountCardGrid({ items, className }: CountCardGridProps) {
  return (
    <dl className={cn("grid gap-1.5 sm:grid-cols-3", className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className="workspace-subtle-surface flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-2.5 py-1.5 sm:block"
        >
          <dt className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="truncate text-xs font-semibold text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
