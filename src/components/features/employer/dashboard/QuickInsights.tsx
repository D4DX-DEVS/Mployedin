import { useTranslations } from "next-intl";

interface QuickInsightsProps {
  avgMatchScore: number;
  highMatchCount: number;
}

/**
 * Quick-insight sidecards for the analytics band (mockup's "Quick Insights").
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
    <div>
      <div className="mb-2.5 pl-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t("title")}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {items.map(({ labelKey, value, stroke, points }) => (
          <div key={labelKey} className="workspace-panel-surface rounded-[20px] p-4">
            <div className="text-xs text-muted-foreground">{t(labelKey)}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
            <svg viewBox="0 0 110 30" preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden>
              <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
