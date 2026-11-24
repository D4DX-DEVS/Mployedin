"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export interface IndustryChipCount {
  industry: string;
  count: number;
}

interface IndustryChipsProps {
  counts: readonly IndustryChipCount[];
  /** The industry filter now applied ("" = none). */
  selected: string;
  /** Called with the industry to filter by, or "" to clear it. */
  onSelect: (industry: string) => void;
  /**
   * One sideways-scrolling line with no card of its own, for placing inside
   * another panel (the admin filter card). Default: its own wrapped card.
   */
  inline?: boolean;
}

/** Shown before "Show all": enough to scan, short enough to keep the list on screen. */
const VISIBLE = 8;

/**
 * Seekers per industry in the current list, biggest first; a chip filters the
 * list to that industry and a second click clears it. Shared by the admin,
 * agent and super agent seeker lists (rollout rows 14/17) — 30+ chips used to
 * push the list half a screen down.
 */
export function IndustryChips({ counts, selected, onSelect, inline = false }: IndustryChipsProps) {
  const t = useTranslations("common.industryChips");
  const [expanded, setExpanded] = useState(false);
  if (counts.length === 0) return null;
  if (inline) {
    return (
      <div className="scrollbar-none flex min-w-0 items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{t("label")}</span>
        {counts.map((item) => {
          const active = selected === item.industry;
          return (
            <button
              key={item.industry}
              type="button"
              onClick={() => onSelect(active ? "" : item.industry)}
              aria-pressed={active}
              className={`inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-foreground hover:border-primary hover:bg-primary/5"
              }`}
            >
              {item.industry}
              <span className="font-medium opacity-70">{item.count}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const hidden = counts.length - VISIBLE;

  // Phone: every chip in one sideways-scrolling row, so the list stays on
  // screen (wrapped pills used to fill half the viewport). sm+: wrap, first
  // VISIBLE chips, "Show all" for the rest. Chips past VISIBLE are always
  // rendered and hidden from sm up by CSS — a selected one stays visible so it
  // can be cleared.
  return (
    <div className="workspace-panel-surface rounded-2xl px-4 py-3 max-sm:!rounded-none max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none sm:px-6">
      <div className="scrollbar-none flex min-w-0 items-center gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible">
        <span className="shrink-0 text-sm font-medium text-muted-foreground">{t("label")}</span>
        {counts.map((item, index) => {
          const active = selected === item.industry;
          const collapsedOnWide = !expanded && index >= VISIBLE && !active;
          return (
            <button
              key={item.industry}
              type="button"
              onClick={() => onSelect(active ? "" : item.industry)}
              aria-pressed={active}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:max-w-full sm:shrink ${
                collapsedOnWide ? "sm:hidden" : ""
              } ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-foreground hover:border-primary hover:bg-primary/5"
              }`}
            >
              <span className="truncate">{item.industry}</span>
              <span className="text-xs font-medium opacity-75">{item.count}</span>
            </button>
          );
        })}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="hidden min-h-9 items-center rounded-full sm:inline-flex px-3 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {expanded ? t("showFewer") : t("showAll", { count: hidden })}
          </button>
        )}
      </div>
    </div>
  );
}
