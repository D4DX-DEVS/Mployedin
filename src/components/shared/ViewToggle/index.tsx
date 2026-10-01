"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideProps } from "lucide-react";
import type { FC } from "react";

export interface ViewToggleOption {
  key: string;
  label: string;
  icon: FC<LucideProps>;
  /** A view that is its own route (interview list vs calendar). */
  href?: string;
  /** A view of the same page (cards vs table): switches without navigating. */
  onSelect?: () => void;
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
 * Options with `onSelect` instead of `href` switch a view within one page
 * (the agent's employer cards vs table) as toggle buttons.
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
        const className = cn(
          // 44px on phones, where the label is hidden and this is a bare
          // 36px icon — the only sub-44 control left in the employer
          // workspace once the ::after tap targets are hit-tested.
          "inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium transition-colors sm:min-h-9",
          isActive
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        );
        const body = (
          <>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{option.label}</span>
          </>
        );
        if (!option.href) {
          return (
            <button
              key={option.key}
              type="button"
              onClick={option.onSelect}
              aria-pressed={isActive}
              aria-label={option.label}
              className={className}
            >
              {body}
            </button>
          );
        }
        return (
          <Link
            key={option.key}
            href={option.href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            /* The label is visually hidden below `sm`, so without this the
               toggle is two unnamed icon links on a phone. */
            aria-label={option.label}
            className={className}
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}
