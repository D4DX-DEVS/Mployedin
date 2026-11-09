"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, Layers } from "lucide-react";
import { ReportCardHeader, ReportEmpty, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import type { UsageSummary } from "@/components/features/admin/ai-usage/useAiUsage";
import { featureColour, usd } from "@/components/features/admin/ai-usage/format";

/** Every UTC day of `YYYY-MM`, so a quiet day is a gap in the chart rather than missing. */
function daysOf(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function SpendCharts({ data, locale, month }: { data: UsageSummary; locale: string; month: string }) {
  const t = useTranslations("adminAiUsage");
  const features = data.features.map((f) => f.feature);
  const days = useMemo(() => daysOf(month), [month]);
  const perDay = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const d of data.daily) {
      const m = map.get(d.day) ?? new Map<string, number>();
      m.set(d.feature, (m.get(d.feature) ?? 0) + d.costUsd);
      map.set(d.day, m);
    }
    return map;
  }, [data.daily]);
  const maxDay = Math.max(0.0001, ...days.map((d) => [...(perDay.get(d)?.values() ?? [])].reduce((s, v) => s + v, 0)));
  const maxFeature = Math.max(0.0001, ...data.features.map((f) => f.costUsd));
  const label = (f: string) => t(`features.${f}` as never);

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <section className={`${reportCardClassName} xl:col-span-8`} aria-labelledby="ai-trend">
        <ReportCardHeader title={t("dailyTitle")} description={t("kpiSpendDetail")} icon={BarChart3} tone="workspace-tone-indigo" />
        {data.daily.length === 0 ? (
          <ReportEmpty>{t("empty")} {t("emptyHint")}</ReportEmpty>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <div
                role="img"
                aria-label={t("dailyTitle")}
                className="flex h-52 min-w-[34rem] items-end gap-1 border-b border-border/70 pt-2"
              >
                {days.map((day) => {
                  const m = perDay.get(day);
                  const total = [...(m?.values() ?? [])].reduce((s, v) => s + v, 0);
                  return (
                    <div key={day} className="flex h-full flex-1 flex-col-reverse" title={`${day}: ${usd(total, locale)}`}>
                      {features.map((f) => {
                        const v = m?.get(f) ?? 0;
                        return v > 0 ? <div key={f} style={{ height: `${(v / maxDay) * 100}%`, background: featureColour(f) }} /> : null;
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: featureColour(f) }} aria-hidden="true" />
                  {label(f)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={`${reportCardClassName} xl:col-span-4`} aria-labelledby="ai-features">
        <ReportCardHeader title={t("featuresTitle")} description={t("kpiSpendDetail")} icon={Layers} tone="workspace-tone-sky" />
        {data.features.length === 0 ? (
          <ReportEmpty>{t("empty")}</ReportEmpty>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.features.map((f) => (
              <li key={f.feature} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{label(f.feature)}</span>
                  <span className="font-semibold tabular-nums">{usd(f.costUsd, locale)}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary" aria-hidden="true">
                  <div className="h-2 rounded-full" style={{ width: `${(f.costUsd / maxFeature) * 100}%`, background: featureColour(f.feature) }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
