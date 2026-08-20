"use client";

import { useState, type ReactNode } from "react";

import { AIChatDraftsCard } from "./AIChatDraftsCard";
import { DraftExtractionsCard } from "./DraftExtractionsCard";
import { DraftJobsCard } from "./DraftJobsCard";

interface DashboardInsightsRowProps {
  locale: string;
  /** AI recommendation card, rendered on the server and passed through. */
  children: ReactNode;
}

/**
 * Two-column dashboard row: AI recommendations on the left, draft/resume cards
 * on the right. The draft cards self-hide when empty, so the column count is
 * driven by their reported counts — with nothing to resume the AI card takes
 * the full width instead of leaving a dead half-row.
 */
export function DashboardInsightsRow({ locale, children }: DashboardInsightsRowProps) {
  const [jobDrafts, setJobDrafts] = useState(0);
  const [chatDrafts, setChatDrafts] = useState(0);
  const [extractionDrafts, setExtractionDrafts] = useState(0);

  const hasDrafts = jobDrafts + chatDrafts + extractionDrafts > 0;

  return (
    <div className={`grid gap-3 sm:gap-4 ${hasDrafts ? "lg:grid-cols-2" : "grid-cols-1"}`}>
      <div className="min-w-0">{children}</div>
      {/* h-full on the cards + stretch alignment keeps both columns level. */}
      {/* Stays mounted while empty so the cards can report their counts. */}
      <div className={`min-w-0 flex-col gap-3 sm:gap-4 [&>section]:flex-1 ${hasDrafts ? "flex" : "hidden"}`}>
        <DraftJobsCard locale={locale} onCountChange={setJobDrafts} />
        <AIChatDraftsCard locale={locale} onCountChange={setChatDrafts} />
        <DraftExtractionsCard locale={locale} onCountChange={setExtractionDrafts} />
      </div>
    </div>
  );
}
