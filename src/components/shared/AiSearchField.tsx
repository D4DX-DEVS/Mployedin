"use client";

import { Loader2, Search, Sparkles, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AiSearchResult } from "@/hooks/useAiFilterSearch";

interface AiSearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  /** Accessible name for the box; defaults to the placeholder. */
  ariaLabel?: string;
  onAskAi: (query: string) => void;
  pending: boolean;
  /** Classes for the wrapper, which is the positioning box. */
  className?: string;
  inputClassName?: string;
}

/**
 * One search box for a list page. Typing searches by keyword as you go; Ask AI
 * reads what was typed into the page's filters. It replaces the old pair of a
 * keyword box plus a second "AI search" box that filled the same filters.
 */
export function AiSearchField({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  onAskAi,
  pending,
  className,
  inputClassName,
}: AiSearchFieldProps) {
  const t = useTranslations("aiFilterSearch");
  const canAsk = value.trim().length > 0 && !pending;

  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn("h-11 rounded-xl border-border bg-background ps-9 pe-12 text-sm shadow-none lg:pe-28", inputClassName)}
      />
      {/* Full height of the box so it keeps the 44px touch target on phones.
          Icon-only below lg: tablet toolbars leave the box ~250px wide. */}
      <button
        type="button"
        onClick={() => onAskAi(value)}
        disabled={!canAsk}
        aria-label={t("askAi")}
        aria-busy={pending}
        title={t("askAiHint")}
        className="absolute inset-y-0 end-0 inline-flex min-w-11 items-center justify-center gap-1.5 rounded-e-xl border-s border-border/70 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
      >
        {pending
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <Sparkles className="h-4 w-4" aria-hidden="true" />}
        <span className="hidden lg:inline">{pending ? t("askingAi") : t("askAi")}</span>
      </button>
    </div>
  );
}

interface AiSearchResultLineProps {
  result: AiSearchResult | null;
  onUndo: () => void;
  onDismiss: () => void;
  className?: string;
}

/** Says what the last Ask AI did, so a filled-in filter never arrives unexplained. */
export function AiSearchResultLine({ result, onUndo, onDismiss, className }: AiSearchResultLineProps) {
  const t = useTranslations("aiFilterSearch");
  if (!result) return null;

  const applied = result.outcome === "applied";
  const message = applied
    ? t("applied")
    : result.outcome === "limit"
      ? t("limit")
      : result.outcome === "no_filters"
        ? t("noFilters")
        : t("unavailable");

  return (
    <div
      role="status"
      className={cn("flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm text-primary", className)}
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <span className={applied ? "font-semibold" : undefined}>{message}</span>
        {result.applied.map((label, index) => (
          <span key={`${index}-${label}`} className="max-w-full truncate rounded-full border border-primary/20 bg-background px-2 py-0.5 text-xs font-medium text-foreground">
            {label}
          </span>
        ))}
      </div>
      <div className="-my-1 flex shrink-0 items-center gap-1">
        {applied && (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("undo")}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("dismiss")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 sm:min-w-8"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
