"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideProps } from "lucide-react";
import type { FC } from "react";

export interface ViewToggleOption {
  key: string;
  href: string;
  label: string;
  icon: FC<LucideProps>;
}

interface ViewToggleProps {
  options: ViewToggleOption[];
  /** `key` of the option representing the page currently rendered. */
  active: string;
  ariaLabel: string;
  className?: string;
}

/**
 * Two routes, one surface.
 *
 * The interview list and the interview calendar read the same data and used to
 * be separate sidebar rows, with the calendar a read-only dead end. Pairing
 * them as views keeps both a click apart while the sidebar carries one entry.
 */
export function ViewToggle({ options, active, ariaLabel, className }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center rounded-xl border border-border bg-muted/40 p-0.5", className)}
    >
      {options.map((option) => {
        const isActive = option.key === active;
        const Icon = option.icon;
        return (
          <Link
            key={option.key}
            href={option.href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            /* The label is visually hidden below `sm`, so without this the
               toggle is two unnamed icon links on a phone. */
            aria-label={option.label}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{option.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
