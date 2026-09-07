"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, RotateCcw, Trash2 } from "lucide-react";

interface DraftRowProps {
  href: string;
  icon: React.ElementType;
  /** Text colour class for the leading icon + CTA, e.g. "text-amber-600". */
  accent: string;
  title: string;
  /** Secondary line (category, time, badges). Hidden on narrow screens. */
  meta?: ReactNode;
  /** Resume CTA label, shown from `sm` up. */
  cta: string;
  discardLabel: string;
  discarding: boolean;
  onDiscard: () => void;
}

/**
 * One resumable-draft row in the dashboard "Drafts to resume" panel. Mirrors
 * the list rows of the match-estimates card beside it (min-h-14, divide-y,
 * hover wash, trailing chevron) so the two panels read as one system.
 */
export function DraftRow({ href, icon: Icon, accent, title, meta, cta, discardLabel, discarding, onDiscard }: DraftRowProps) {
  return (
    <li className="group flex min-h-14 items-center gap-2 px-2 py-1.5 transition-colors hover:bg-secondary/60 sm:px-3">
      <Link
        href={href}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
          {meta && (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4 text-muted-foreground">
              {meta}
            </span>
          )}
        </span>
        <span className={`hidden shrink-0 items-center gap-1 text-xs font-semibold sm:inline-flex ${accent}`}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {cta}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
      <button
        type="button"
        disabled={discarding}
        onClick={onDiscard}
        aria-label={discardLabel}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50"
      >
        {discarding ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </li>
  );
}
