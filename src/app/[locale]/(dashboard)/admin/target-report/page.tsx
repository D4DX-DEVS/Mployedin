"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Briefcase, CircleDollarSign, Gauge, Receipt, Wallet } from "lucide-react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { PageHero } from "@/components/shared/PageHero";
import { ErrorState } from "@/components/shared/ErrorState";
import { ReportKpiGrid, type ReportKpi } from "@/components/features/admin/reports/ReportKpiGrid";
import { ReportCardHeader, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { IncomeSourcesList } from "@/components/features/targets/IncomeSourcesList";
import { TargetYearSelect } from "@/components/features/targets/TargetYearSelect";
import { formatProfit } from "@/components/features/targets/profitFormat";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatCount } from "@/lib/ui/intlFormat";
import { BehindPaceList } from "./_components/behind-pace-list";
import { TargetReportList } from "./_components/target-report-list";
import { TargetProgressChart } from "./_components/target-progress-chart";
import { percentOf, type TargetReport } from "./_components/types";

/*
 * Target report: four totals, then
 *   Monthly profit (target vs achieved) | Behind pace (who to talk to)
 *   Where the profit came from
 *   Target reports (every plan as a card: completion status, growth, target bar and
 *   period bars, opening into the full report; super agents with their agents)
 * Every figure is company profit: net invoice income after commissions.
 */

/** The TargetProfile schema's year bounds; the URL can only hold one of these. */
const YEAR_OPTIONS = Array.from({ length: 81 }, (_, index) => String(2020 + index));

function ProgressFooter({ share, label }: { share: number | null; label: string }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, share ?? 0)}%` }} />
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function AdminTargetReportPage() {
  const t = useTranslations("adminTargetReport");
  const locale = useLocale();
  const currentYear = String(new Date().getFullYear());
  // The year lives in the URL, like the Platform tab's period, so a refresh or a shared link
  // shows the same plan year. With none chosen the API opens on a year that has targets, so
  // targets set for next year are there to see; picking a year always writes it to the URL.
  const [chosenYear, setYear] = useUrlFilter("year", "", { allow: YEAR_OPTIONS });

  // Cached per year; the previous year's figures stay on screen while the next loads.
  const { data, isLoading, isFetching, isError, refetch } = useQuery<TargetReport>({
    queryKey: ["admin", "target-report", chosenYear || "auto"],
    queryFn: async () => {
      const response = await fetch(chosenYear ? `/api/admin/target-report?year=${chosenYear}` : "/api/admin/target-report");
      if (!response.ok) throw new Error(`Target report error: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });

  const year = data ? String(data.year) : chosenYear || currentYear;
  const managementHref = `/${locale}/admin/target-management?year=${year}`;
  const yearOptions = data?.years.map(String) ?? [year];

  const kpis: ReportKpi[] = [];
  if (data) {
    const { profit, drivers, people } = data.totals;
    const money = (value: number, notation: "standard" | "compact" = "standard") => formatProfit(value, profit.currency, locale, notation);
    const share = percentOf(profit.achieved, profit.target);
    const started = people.total - people.notStarted;
    const commissionShare = percentOf(drivers.commissionCost, drivers.revenue);
    kpis.push(
      {
        key: "profit",
        label: t("metricProfit"),
        value: money(profit.achieved),
        phoneValue: money(profit.achieved, "compact"),
        detail: profit.target > 0 ? t("kpiProfitDetail", { target: money(profit.target) }) : t("kpiProfitNoTarget"),
        footer: <ProgressFooter share={share} label={share === null ? t("noTarget") : t("percentOfTarget", { percent: share })} />,
        note: profit.others.length > 0 ? t("profitOtherCurrencies", { count: profit.others.length }) : null,
        dot: "bg-emerald-500",
        tone: "workspace-tone-emerald",
        icon: CircleDollarSign,
        href: managementHref,
      },
      {
        key: "revenue",
        label: t("metricRevenue"),
        value: money(drivers.revenue),
        phoneValue: money(drivers.revenue, "compact"),
        detail: t("kpiRevenueDetail"),
        dot: "bg-sky-500",
        tone: "workspace-tone-sky",
        icon: Wallet,
        href: managementHref,
      },
      {
        key: "commission",
        label: t("metricCommission"),
        value: money(drivers.commissionCost),
        phoneValue: money(drivers.commissionCost, "compact"),
        detail: commissionShare === null ? t("kpiCommissionDetail") : t("kpiCommissionShare", { percent: commissionShare }),
        dot: "bg-amber-500",
        tone: "workspace-tone-amber",
        icon: Receipt,
        href: managementHref,
      },
      {
        key: "pace",
        label: t("kpiOnPace"),
        value: `${formatCount(people.onPace + people.achieved, undefined, locale)} / ${formatCount(started, undefined, locale)}`,
        phoneValue: formatCount(people.onPace + people.achieved, undefined, locale),
        detail: started === 0 && people.total > 0
          ? t("kpiNotStarted", { year: data.year })
          : t("kpiOnPaceDetail", { expected: data.expectedProgress, year: data.year }),
        footer: (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${people.behind > 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {t("behindCount", { count: people.behind })}
          </span>
        ),
        dot: people.behind > 0 ? "bg-rose-500" : "bg-emerald-500",
        tone: people.behind > 0 ? "workspace-tone-rose" : "workspace-tone-emerald",
        icon: Gauge,
        href: managementHref,
      },
    );
  }

  return (
    <div className="page-container print:space-y-4">
      <div className="print:hidden">
        <ReportTabs />
      </div>
      <PageHero
        compact
        compactOnMobile
        title={t("title")}
        description={t("description", { year })}
        actions={<TargetYearSelect value={year} onChange={setYear} label={t("yearLabel")} years={yearOptions} />}
      />

      {isError && !data ? (
        <ErrorState title={t("failedToLoad")} onRetry={() => { void refetch(); }} retryLabel={t("retry")} />
      ) : isLoading || !data ? (
        <div className="space-y-6" role="status" aria-live="polite" aria-label={t("loading")}>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="workspace-panel-surface h-16 animate-pulse rounded-2xl sm:h-36" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-12">
            <div className="workspace-panel-surface h-80 animate-pulse rounded-3xl xl:col-span-7" />
            <div className="workspace-panel-surface h-80 animate-pulse rounded-3xl xl:col-span-5" />
          </div>
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${isFetching ? "opacity-60" : ""}`} aria-busy={isFetching}>
          <ReportKpiGrid kpis={kpis} ariaLabel={t("a11yTotals")} />

          <div className="grid gap-6 xl:grid-cols-12">
            <TargetProgressChart
              className="xl:col-span-7"
              monthly={data.monthly}
              year={data.year}
              currency={data.totals.profit.currency}
              locale={locale}
            />
            <BehindPaceList
              className="xl:col-span-5"
              people={data.people}
              year={data.year}
              expectedProgress={data.expectedProgress}
              locale={locale}
            />
          </div>

          <section className={reportCardClassName} aria-label={t("sourcesTitle")}>
            <ReportCardHeader
              title={t("sourcesTitle")}
              description={t("sourcesDescription")}
              icon={Briefcase}
              tone="workspace-tone-violet"
            />
            <IncomeSourcesList
              byCategory={data.byCategory}
              currency={data.totals.profit.currency ?? "AED"}
              emptyLabel={t("noSources", { year: data.year })}
            />
          </section>

          <TargetReportList key={data.year} people={data.people} year={data.year} locale={locale} />
        </div>
      )}
    </div>
  );
}
