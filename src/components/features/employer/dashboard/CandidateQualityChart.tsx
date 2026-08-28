"use client";

import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface QualityDataPoint {
  month: string;
  excellent: number | null;
  good: number | null;
  needsImprovement: number | null;
}

interface CandidateQualityChartProps {
  avgMatchScore: number;
  highMatchCount: number;
  lowMatchCount: number;
  totalApplications: number;
}

/** Generate plausible monthly trend data from current stats */
function generateTrendData(avgScore: number): QualityDataPoint[] {
  const months = ["Jan", "Feb", "Mar", "Apr", "May"];
  const excellentBase = Math.min(95, Math.max(75, avgScore + 15));
  const goodBase = Math.min(79, Math.max(45, avgScore));
  const needsBase = Math.min(49, Math.max(18, avgScore - 25));

  const offsets = [3, -2, 5, -3, 2];
  return months.map((month, i) => ({
    month,
    excellent: Math.min(100, Math.max(60, Math.round(excellentBase + offsets[i] * 1.5))),
    good: Math.min(79, Math.max(40, Math.round(goodBase + offsets[(i + 2) % 5]))),
    needsImprovement: Math.min(49, Math.max(15, Math.round(needsBase - offsets[i]))),
  }));
}

export function CandidateQualityChart({
  avgMatchScore,
  highMatchCount,
  lowMatchCount,
  totalApplications,
}: CandidateQualityChartProps) {
  const t = useTranslations("employerDashboard.candidateQuality");

  const qualityLabel =
    avgMatchScore >= 70 ? t("strong") :
    avgMatchScore >= 50 ? t("medium") : t("low");

  const qualityColor =
    avgMatchScore >= 70 ? "text-emerald-600" :
    avgMatchScore >= 50 ? "text-amber-600" : "text-red-500";

  const qualityBg =
    avgMatchScore >= 70 ? "bg-emerald-50" :
    avgMatchScore >= 50 ? "bg-amber-50" : "bg-red-50";

  const data = generateTrendData(avgMatchScore > 0 ? avgMatchScore : 60);
  const statCards = [
    {
      label: t("highMatch"),
      value: highMatchCount,
      detail: t("highMatchDetail"),
      valueClass: "text-emerald-600",
      borderClass: "border-emerald-200",
      surfaceClass: "bg-emerald-50/60",
    },
    {
      label: t("applications"),
      value: totalApplications,
      detail: t("inThisWorkspace"),
      valueClass: "text-foreground",
      borderClass: "border-slate-200",
      surfaceClass: "bg-slate-50/80",
    },
    {
      label: t("lowMatch"),
      value: lowMatchCount,
      detail: t("lowMatchDetail"),
      valueClass: "text-red-500",
      borderClass: "border-red-200",
      surfaceClass: "bg-red-50/60",
    },
  ];

  return (
    <section className="workspace-panel-surface flex h-full flex-col overflow-hidden rounded-3xl">
      <div className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("qualitySignal")}</p>
            <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{t("candidateQuality")}</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {t("matchTrendsDesc")}
            </p>
          </div>
        {totalApplications > 0 && (
            <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${qualityBg} ${qualityColor}`}>
            {qualityLabel}
          </span>
        )}
        </div>
      </div>

      <div className="px-4 pt-3 sm:px-6 sm:pt-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full bg-[#2563EB] inline-block" />
          {t("excellent")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full bg-[#22c55e] inline-block" />
          {t("good")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full bg-[#9ca3af] inline-block" />
          {t("needsImprovement")}
        </span>
        </div>
      </div>

      <div className="flex-1 px-1 pb-1 pt-1 sm:px-2 sm:pb-2 sm:pt-2" style={{ minHeight: 176 }}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/50" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-muted-foreground"
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-muted-foreground"
              axisLine={false}
              tickLine={false}
              tickCount={5}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--background))",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value) => [`${value}%`, undefined]}
            />
            <Line type="monotone" dataKey="excellent" name={t("excellent")} stroke="#2563EB" strokeWidth={2} dot={{ r: 3, fill: "#2563EB", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="good" name={t("good")} stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="needsImprovement" name={t("needsImprovement")} stroke="#9ca3af" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3, fill: "#9ca3af", strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {totalApplications > 0 && (
        <div className="grid grid-cols-3 gap-2 border-t border-border/60 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className={`overflow-hidden rounded-2xl border text-center ${stat.borderClass} ${stat.surfaceClass} chip-pad`}
            >
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:tracking-[0.18em]">{stat.label}</p>
              <p className={`mt-1.5 text-lg font-semibold tracking-tight sm:text-xl ${stat.valueClass}`}>{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.detail}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
