"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Building2, CircleDollarSign, Gauge, UserCheck } from "lucide-react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { PageHero } from "@/components/shared/PageHero";
import { ErrorState } from "@/components/shared/ErrorState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportKpiGrid, type ReportKpi } from "@/components/features/admin/reports/ReportKpiGrid";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatCount } from "@/lib/ui/intlFormat";
import { BehindPaceList } from "./_components/behind-pace-list";
import { TargetPeopleTable } from "./_components/target-people-table";
import { TargetProgressChart } from "./_components/target-progress-chart";
import { percentOf, type Progress, type TargetReport } from "./_components/types";

/*
 * Target report: four totals, then
 *   Monthly progress (target vs achieved) | Behind pace (who to talk to)
 *   Progress by person (every plan, searchable, exportable)
 * Dropped: business volume (the Commissions tab, and it added INR to AED),
 * the quarterly chart (counts and money on one axis), the year-over-year grid
 * and the quarter/category/risk filters that only re-sliced the same numbers.
 */

/** The TargetProfile schema's year bounds; the URL can only hold one of these. */
const YEAR_OPTIONS = Array.from({ length: 81 }, (_, index) => String(2020 + index));

function ProgressFooter({ progress, label }: { progress: Progress; label: string }) {
  const share = percentOf(progress);
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
  // The year lives in the URL, like the Platform tab's period, so a refresh or
  // a shared link shows the same plan year.
  const [year, setYear] = useUrlFilter("year", currentYear, { allow: YEAR_OPTIONS });

  // Cached per year; the previous year's figures stay on screen while the next loads.
  const { data, isLoading, isFetching, isError, refetch } = useQuery<TargetReport>({
    queryKey: ["admin", "target-report", year],
    queryFn: async () => {
      const response = await fetch(`/api/admin/target-report?year=${year}`);
      if (!response.ok) throw new Error(`Target report error: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });

  const count = (value: number) => formatCount(value, undefined, locale);
  const shareLabel = (progress: Progress) => {
    const share = percentOf(progress);
    return share === null ? t("noTarget") : t("percentOfTarget", { percent: share });
  };
  const managementHref = `/${locale}/admin/target-management?year=${year}`;
  const yearOptions = data?.years.map(String) ?? [currentYear];

  const kpis: ReportKpi[] = [];
  if (data) {
    const { employers, employees, finance, people } = data.totals;
    const money = (value: number, notation: "standard" | "compact" = "standard") => finance.currency
      ? formatCount(value, { style: "currency", currency: finance.currency, notation, maximumFractionDigits: 0 }, locale)
      : count(value);
    kpis.push(
      {
        key: "employers",
        label: t("metricEmployers"),
        value: `${count(employers.achieved)} / ${count(employers.target)}`,
        phoneValue: count(employers.achieved),
        detail: t("kpiEmployersDetail"),
        footer: <ProgressFooter progress={employers} label={shareLabel(employers)} />,
        dot: "bg-blue-500",
        tone: "workspace-tone-sky",
        icon: Building2,
        href: managementHref,
      },
      {
        key: "employees",
        label: t("metricEmployees"),
        value: `${count(employees.achieved)} / ${count(employees.target)}`,
        phoneValue: count(employees.achieved),
        detail: t("kpiEmployeesDetail"),
        footer: <ProgressFooter progress={employees} label={shareLabel(employees)} />,
        dot: "bg-violet-500",
        tone: "workspace-tone-violet",
        icon: UserCheck,
        href: managementHref,
      },
      {
        key: "finance",
        label: t("metricFinance"),
        value: money(finance.achieved),
        phoneValue: money(finance.achieved, "compact"),
        detail: finance.target > 0 ? t("kpiFinanceDetail", { target: money(finance.target) }) : t("kpiFinanceNoTarget"),
        footer: <ProgressFooter progress={finance} label={shareLabel(finance)} />,
        note: finance.others.length > 0 ? t("financeOtherCurrencies", { count: finance.others.length }) : null,
        dot: "bg-amber-500",
        tone: "workspace-tone-amber",
        icon: CircleDollarSign,
        href: managementHref,
      },
      {
        key: "pace",
        label: t("kpiOnPace"),
        value: `${count(people.onPace + people.achieved)} / ${count(people.total)}`,
        phoneValue: count(people.onPace + people.achieved),
        detail: t("kpiOnPaceDetail", { expected: data.expectedProgress, year: data.year }),
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
        actions={(
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger aria-label={t("yearLabel")} className="h-10 w-[8.5rem] rounded-xl border-border/70 bg-background/90 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(yearOptions.includes(year) ? yearOptions : [year, ...yearOptions]).map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
              currency={data.totals.finance.currency}
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

          <TargetPeopleTable people={data.people} year={data.year} locale={locale} />
        </div>
      )}
    </div>
  );
}
