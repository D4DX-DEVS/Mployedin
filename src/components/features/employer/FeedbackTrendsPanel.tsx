"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { BarChart3, TrendingUp, Users, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FeedbackTrendsData {
  total: number;
  months: number;
  averages: {
    technical: number;
    communication: number;
    cultureFit: number;
    problemSolving: number;
    motivation: number;
    overall: number;
  };
  trends: {
    month: string;
    technical: number;
    communication: number;
    cultureFit: number;
    problemSolving: number;
    motivation: number;
    overall: number;
    count: number;
  }[];
  recommendations: Record<string, number>;
  distribution: { range: string; count: number }[];
}

const DIMENSION_KEYS = ["technical", "communication", "cultureFit", "problemSolving", "motivation"] as const;

const DIMENSION_COLORS: Record<string, string> = {
  technical: "bg-blue-500",
  communication: "bg-purple-500",
  cultureFit: "bg-emerald-500",
  problemSolving: "bg-amber-500",
  motivation: "bg-rose-500",
};

const REC_LABELS: Record<string, { key: "strongYes" | "yes" | "neutral" | "no" | "strongNo"; color: string }> = {
  strong_yes: { key: "strongYes", color: "bg-emerald-500" },
  yes: { key: "yes", color: "bg-green-500" },
  neutral: { key: "neutral", color: "bg-amber-500" },
  no: { key: "no", color: "bg-orange-500" },
  strong_no: { key: "strongNo", color: "bg-red-500" },
};

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-10 text-right">{value.toFixed(1)}/5</span>
    </div>
  );
}

export function FeedbackTrendsPanel() {
  const t = useTranslations("employerScorecards");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const { data, isLoading, error } = useQuery<FeedbackTrendsData>({
    queryKey: ["feedback-trends"],
    queryFn: async () => {
      const res = await fetch("/api/employers/analytics/feedback-trends?months=6");
      if (!res.ok) throw new Error("Failed to load feedback trends");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">{t("loadingFeedbackTrends")}</span>
      </div>
    );
  }

  if (error || !data || data.total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          {t("feedbackTrends")}
        </p>
      </div>
    );
  }

  const totalRecs = Object.values(data.recommendations).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
          <Users className="w-5 h-5 text-primary mx-auto mb-1" />
          <div className="text-2xl font-bold">{data.total.toLocaleString(numberLocale)}</div>
          <div className="text-xs text-muted-foreground">{t("totalEvaluations")}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
          <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <div className="text-2xl font-bold">{data.averages.overall.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">{t("avgScore")}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
          <Badge className="bg-emerald-100 text-emerald-700 mb-1">
            {(data.recommendations.strong_yes + data.recommendations.yes).toLocaleString(numberLocale)}
          </Badge>
          <div className="text-xs text-muted-foreground mt-1">{t("positiveRecs")}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 text-center">
          <Badge className="bg-red-100 text-red-700 mb-1">
            {(data.recommendations.strong_no + data.recommendations.no).toLocaleString(numberLocale)}
          </Badge>
          <div className="text-xs text-muted-foreground mt-1">{t("negativeRecs")}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Average Scores by Dimension */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            {t("averageScoresByDimension")}
          </h3>
          <div className="space-y-3">
            {DIMENSION_KEYS.map((key) => (
              <ScoreBar
                key={key}
                label={t(`dimensions.${key}`)}
                value={data.averages[key as keyof typeof data.averages] ?? 0}
                color={DIMENSION_COLORS[key] ?? "bg-gray-500"}
              />
            ))}
          </div>
        </div>

        {/* Recommendation Distribution */}
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {t("recommendationDistribution")}
          </h3>
          <div className="space-y-2.5">
            {Object.entries(REC_LABELS).map(([key, { key: labelKey, color }]) => {
              const count = data.recommendations[key] ?? 0;
              const pct = Math.round((count / totalRecs) * 100);
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{t(labelKey)}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold w-14 text-end">{count.toLocaleString(numberLocale)} ({pct.toLocaleString(numberLocale)}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly Trends Table */}
      {data.trends.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {t("monthlyScoreTrends")}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-start py-2 pe-3">{t("month")}</th>
                  <th className="text-center py-2 px-2">{t("count")}</th>
                  <th className="text-center py-2 px-2">{t("dimensions.technical")}</th>
                  <th className="text-center py-2 px-2">{t("dimensions.communication")}</th>
                  <th className="text-center py-2 px-2">{t("dimensions.cultureFit")}</th>
                  <th className="text-center py-2 px-2">{t("dimensions.problemSolving")}</th>
                  <th className="text-center py-2 px-2">{t("dimensions.motivation")}</th>
                  <th className="text-center py-2 px-2 font-bold">{t("overall")}</th>
                </tr>
              </thead>
              <tbody>
                {data.trends.map((t) => (
                  <tr key={t.month} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pe-3 font-medium">{t.month}</td>
                    <td className="text-center py-2 px-2">{t.count.toLocaleString(numberLocale)}</td>
                    <td className="text-center py-2 px-2">{t.technical.toFixed(1)}</td>
                    <td className="text-center py-2 px-2">{t.communication.toFixed(1)}</td>
                    <td className="text-center py-2 px-2">{t.cultureFit.toFixed(1)}</td>
                    <td className="text-center py-2 px-2">{t.problemSolving.toFixed(1)}</td>
                    <td className="text-center py-2 px-2">{t.motivation.toFixed(1)}</td>
                    <td className="text-center py-2 px-2 font-bold">{t.overall.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Score Distribution */}
      {data.distribution.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">{t("scoreDistribution")}</h3>
          <div className="flex items-end gap-2 h-24">
            {data.distribution.map((b) => {
              const maxCount = Math.max(...data.distribution.map((d) => d.count), 1);
              const heightPct = Math.max(8, (b.count / maxCount) * 100);
              return (
                <div key={b.range} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold">{b.count.toLocaleString(numberLocale)}</span>
                  <div
                    className="w-full rounded-t-md bg-primary/80 transition-all"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{b.range}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
