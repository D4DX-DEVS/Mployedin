"use client";

import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currency";
import type { KpiMonth } from "@/lib/targets/kpiCalculator";
import { type ITargetPeriod } from "@/models/TargetProfile";

interface MonthActualsCardProps {
  kpi?: unknown;
  periods?: ITargetPeriod[];
  currency: string;
  year: number;
}

export function MonthActualsCard({ kpi, periods, currency, year }: MonthActualsCardProps) {
  const t = useTranslations("profitTargets");

  if (!kpi || !periods || periods.length === 0) {
    return null;
  }

  const kpiData = kpi as { months: KpiMonth[]; totals: { jobs: number; onboarded: number; revenue: number } };

  const monthNames = [
    t("month_1"),
    t("month_2"),
    t("month_3"),
    t("month_4"),
    t("month_5"),
    t("month_6"),
    t("month_7"),
    t("month_8"),
    t("month_9"),
    t("month_10"),
    t("month_11"),
    t("month_12"),
  ];

  const today = new Date();
  const isCurrentYear = today.getUTCFullYear() === year;
  const currentMonth = isCurrentYear ? today.getUTCMonth() + 1 : 13;

  const getMonthTargets = (monthNum: number) => {
    const monthPeriods = periods.filter((p) => {
      const start = new Date(p.startDate);
      const end = new Date(p.endDate);
      const year = start.getUTCFullYear();
      // Check if month falls within this period
      const checkDate = new Date(Date.UTC(year, monthNum - 1, 1));
      return checkDate >= start && checkDate <= end;
    });

    if (monthPeriods.length === 0) return { jobs: 0, conversion: 0, revenue: 0 };

    const totals = monthPeriods.reduce(
      (acc, p) => ({
        jobs: acc.jobs + (p.jobTarget || 0),
        conversion: acc.conversion + (p.conversionTarget || 0),
        revenue: acc.revenue + (p.revenueTarget || 0),
      }),
      { jobs: 0, conversion: 0, revenue: 0 }
    );

    return totals;
  };

  const getQuarterData = (quarterNum: number) => {
    const months = [
      (quarterNum - 1) * 3 + 1,
      (quarterNum - 1) * 3 + 2,
      (quarterNum - 1) * 3 + 3,
    ];
    const data = {
      jobs: 0,
      onboarded: 0,
      revenue: 0,
      jobTarget: 0,
      conversionTarget: 0,
      revenueTarget: 0,
    };
    months.forEach((m) => {
      if (m <= 12) {
        data.jobs += kpiData.months[m - 1]?.jobs || 0;
        data.onboarded += kpiData.months[m - 1]?.onboarded || 0;
        data.revenue += kpiData.months[m - 1]?.revenue || 0;
        const targets = getMonthTargets(m);
        data.jobTarget += targets.jobs;
        data.conversionTarget += targets.conversion;
        data.revenueTarget += targets.revenue;
      }
    });
    return data;
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b px-6 py-4">
        <h3 className="font-semibold tracking-tight">{t("monthByMonthTitle")}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t("month")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("jobs")} {t("actual")} / {t("target")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("onboarded")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("revenue")} ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {/* Individual months */}
            {kpiData.months.map((month, idx) => {
              const targets = getMonthTargets(month.month);
              const isAfterToday = month.month > currentMonth;
              return (
                <tr key={month.month} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{monthNames[idx]}</td>
                  <td className="px-4 py-3 text-right">
                    {isAfterToday ? "—" : `${month.jobs} / ${targets.jobs}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isAfterToday ? "—" : month.onboarded}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isAfterToday ? "—" : formatCurrency(month.revenue, currency)}
                  </td>
                </tr>
              );
            })}

            {/* Q1-Q4 rollups */}
            {[1, 2, 3, 4].map((q) => {
              const data = getQuarterData(q);
              return (
                <tr key={`q${q}`} className="bg-muted/20 font-medium hover:bg-muted/30">
                  <td className="px-4 py-3">{t("quarter", { quarter: q })}</td>
                  <td className="px-4 py-3 text-right">{data.jobs} / {data.jobTarget}</td>
                  <td className="px-4 py-3 text-right">{data.onboarded}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(data.revenue, currency)}</td>
                </tr>
              );
            })}

            {/* Year total */}
            <tr className="bg-sky-50/50 font-semibold hover:bg-sky-100/50">
              <td className="px-4 py-3">{t("yearTotal")}</td>
              <td className="px-4 py-3 text-right">{kpiData.totals.jobs} / {periods.reduce((sum, p) => sum + (p.jobTarget || 0), 0)}</td>
              <td className="px-4 py-3 text-right">{kpiData.totals.onboarded}</td>
              <td className="px-4 py-3 text-right">{formatCurrency(kpiData.totals.revenue, currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
