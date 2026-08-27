import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

interface QuickInsightsProps {
  avgMatchScore: number;
  highMatchCount: number;
}

/**
 * Quick-insight card for the analytics band — matches the Hiring Pipeline card
 * (same surface + eyebrow header) and stretches to its height, with the two
 * metric tiles filling the space and sparklines pinned to the bottom.
 * ponytail: sparklines are a static decorative trend — wire to a real weekly
 * series when the stats layer starts persisting history.
 */
export function QuickInsights({ avgMatchScore, highMatchCount }: QuickInsightsProps) {
  const t = useTranslations("employerDashboard.quickInsights");

  const items = [
    {
      labelKey: "avgFitScore",
      value: `${Math.round(avgMatchScore)}%`,
      stroke: "#2F6FED",
      points: "0,22 15,18 30,20 45,10 60,14 75,6 90,10 110,4",
    },
    {
      labelKey: "greatFitCandidates",
      value: String(highMatchCount),
      stroke: "#1FA35C",
      points: "0,24 15,20 30,22 45,14 60,16 75,8 90,12 110,2",
    },
  ];

  return (
    <section className="workspace-panel-surface flex h-full flex-col overflow-hidden rounded-3xl">
      <div className="border-b border-border/60 px-3.5 py-3 sm:px-6 sm:py-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
          <Sparkles className="h-3.5 w-3.5" />
          {t("title")}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4 p-4 sm:p-5">
        {items.map(({ labelKey, value, stroke, points }) => (
          <div key={labelKey} className="flex flex-col rounded-2xl border border-border/60 bg-background/60 card-pad">
            <div className="text-xs text-muted-foreground">{t(labelKey)}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
            <svg viewBox="0 0 110 30" preserveAspectRatio="none" className="mt-auto h-10 w-full pt-3" aria-hidden>
              <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ))}
      </div>
    </section>
  );
}
