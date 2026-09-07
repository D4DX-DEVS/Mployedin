"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

import { DraftsCard } from "./DraftsCard";

interface DashboardInsightsRowProps {
  locale: string;
  /** AI recommendation card, rendered on the server and passed through. */
  children: ReactNode;
}

/**
 * Two-column dashboard row: match estimates on the left, one tabbed
 * "Drafts to resume" card on the right. The drafts card self-hides when
 * empty, so with nothing to resume the match card takes the full width
 * instead of leaving a dead half-row.
 *
 * Both cards are header + ≤3 list rows, so the grid's default stretch keeps
 * their tops and bottoms level without opening a void in either. The
 * assistive note about match estimates sits under the row as a caption
 * rather than as a card footer — as a footer it was the thing being pushed
 * to the bottom of a much taller stretched card.
 */
export function DashboardInsightsRow({ locale, children }: DashboardInsightsRowProps) {
  const t = useTranslations("employerDashboard.aiRecommended");
  const [draftCount, setDraftCount] = useState(0);
  const hasDrafts = draftCount > 0;

  return (
    <div>
      <div className={`grid gap-3 sm:gap-4 ${hasDrafts ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        <div className="min-w-0">{children}</div>
        {/* Stays mounted while empty so the card can report its count. */}
        <div className={`min-w-0 ${hasDrafts ? "" : "hidden"}`}>
          <DraftsCard locale={locale} onCountChange={setDraftCount} />
        </div>
      </div>
      <p className="mt-2 flex items-start gap-2 px-1 text-xs leading-5 text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden="true" />
        <span>{t("assistiveNote")}</span>
      </p>
    </div>
  );
}
