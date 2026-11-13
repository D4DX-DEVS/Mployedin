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
}

/** Shown before "Show all": enough to scan, short enough to keep the list on screen. */
const VISIBLE = 8;

/**
 * Seekers per industry in the current list, biggest first; a chip filters the
 * list to that industry and a second click clears it. Shared by the admin,
 * agent and super agent seeker lists (rollout rows 14/17) — 30+ chips used to
 * push the list half a screen down.
 */
export function IndustryChips({ counts, selected, onSelect }: IndustryChipsProps) {
  const t = useTranslations("common.industryChips");
  const [expanded, setExpanded] = useState(false);
  if (counts.length === 0) return null;

  const top = counts.slice(0, VISIBLE);
  // A selected industry outside the top stays visible, so it can be cleared.
  const pinned = !expanded && selected && !top.some((c) => c.industry === selected)
    ? counts.filter((c) => c.industry === selected)
    : [];
  const shown = expanded ? counts : [...top, ...pinned];
  const hidden = counts.length - top.length;

  return (
    <div className="workspace-panel-surface rounded-2xl px-4 py-3 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t("label")}</span>
        {shown.map((item) => {
          const active = selected === item.industry;
          return (
            <button
              key={item.industry}
              type="button"
              onClick={() => onSelect(active ? "" : item.industry)}
              aria-pressed={active}
              className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
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
            className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {expanded ? t("showFewer") : t("showAll", { count: hidden })}
          </button>
        )}
      </div>
    </div>
  );
}
