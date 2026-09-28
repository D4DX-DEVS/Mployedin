"use client";

import { useLocale, useTranslations } from "next-intl";
import { DollarSign, UserMinus, UserPlus, Users } from "lucide-react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { PageHero } from "@/components/shared/PageHero";
import { ErrorState } from "@/components/shared/ErrorState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChangeBadge, type PeriodPair } from "@/components/features/admin/reports/ReportCard";
import { ReportKpiGrid, type ReportKpi } from "@/components/features/admin/reports/ReportKpiGrid";
import { useSubscriptionDashboard } from "@/components/features/subscription-dashboard/useSubscriptionDashboard";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { DASHBOARD_PERIODS, DEFAULT_DASHBOARD_PERIOD } from "@/lib/admin/dashboard/period";
import { formatCount } from "@/lib/ui/intlFormat";
import { PayingCustomers } from "./_components/paying-customers";
import { PlanMix } from "./_components/plan-mix";
import { RenewalsDue } from "./_components/renewals-due";
import { StartedLostChart } from "./_components/started-lost-chart";

/*
 * Subscriptions report, on the Platform tab's layout: four totals, then
 *   Plan mix (who is on what, what it brings in) | Renewals due (next 30 days)
 *   Started and lost (per month)                 | Paying customers (the one funnel)
 * Cut from fourteen sections: the alerts strip counted the same renewals twice,
 * "monthly growth" compared against a month that renewals empty, LTV was
 * invented, "top agents this month" was all-time, and customer, activity and
 * invoice lists each have their own page.
 */
export default function AdminSubscriptionDashboardPage() {
  const t = useTranslations("adminSubscriptionDashboard");
  const tDashboard = useTranslations("adminDashboard");
  const locale = useLocale();
  // Same window control as the Platform tab and the dashboard, kept in the URL.
  const [period, setPeriod] = useUrlFilter("period", DEFAULT_DASHBOARD_PERIOD, { allow: DASHBOARD_PERIODS });
  const { data, isLoading, isFetching, error, refetch } = useSubscriptionDashboard(period);

  const count = (value: number) => formatCount(value, undefined, locale);
  const days = data?.period.days ?? Number.parseInt(period, 10);
  const changeLabels = { new: t("trendNew"), none: t("trendNoChange") };
  const changeFooter = (pair: PeriodPair, goodDirection: "up" | "down") => (
    <>
      <ChangeBadge pair={pair} formatValue={count} labels={changeLabels} goodDirection={goodDirection} />
      <span className="text-xs text-muted-foreground">{t("vsPreviousPeriod", { days })}</span>
    </>
  );
  const listHref = `/${locale}/admin/subscriptions`;

  const kpis: ReportKpi[] = [];
  if (data) {
    // Every amount is in the currency the API reports; others are named, never added in.
    const money = (value: number, notation: "standard" | "compact" = "standard") =>
      formatCount(value, { style: "currency", currency: data.currency, notation, maximumFractionDigits: 0 }, locale);
    kpis.push(
      {
        key: "mrr",
        label: t("mrrLabel"),
        value: money(data.mrr),
        phoneValue: money(data.mrr, "compact"),
        detail: t("kpiMrrDetail", { count: data.active.paid }),
        footer: <span className="text-xs text-muted-foreground">{t("arr", { amount: money(data.mrr * 12, "compact") })}</span>,
        note: data.otherCurrencies.length > 0
          ? t("otherCurrenciesNote", {
            count: data.otherCurrencies.reduce((sum, row) => sum + row.count, 0),
            others: data.otherCurrencies.map((row) => row.currency).join(", "),
          })
          : null,
        dot: "bg-indigo-500",
        tone: "workspace-tone-indigo",
        icon: DollarSign,
        href: listHref,
      },
      {
        key: "active",
        label: t("activeSubscriptionsLabel"),
        value: count(data.active.total),
        detail: t("kpiActiveDetail", { paid: data.active.paid, free: data.active.free }),
        footer: (
          <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <span className="h-full bg-emerald-500" style={{ width: `${data.active.total > 0 ? (data.active.paid / data.active.total) * 100 : 0}%` }} />
          </span>
        ),
        dot: "bg-emerald-500",
        tone: "workspace-tone-emerald",
        icon: Users,
        href: listHref,
      },
      {
        key: "started",
        label: t("startedLabel"),
        value: count(data.trends.started.current),
        detail: t("kpiStartedDetail", { days }),
        footer: changeFooter(data.trends.started, "up"),
        dot: "bg-blue-500",
        tone: "workspace-tone-sky",
        icon: UserPlus,
        // The list opens newest first.
        href: listHref,
      },
      {
        // No link: the subscriptions list has no URL filter for cancelled + expired.
        key: "lost",
        label: t("lostLabel"),
        value: count(data.trends.lost.current),
        detail: t("kpiLostDetail", { days }),
        footer: changeFooter(data.trends.lost, "down"),
        dot: data.trends.lost.current > 0 ? "bg-rose-500" : "bg-slate-400",
        tone: "workspace-tone-rose",
        icon: UserMinus,
      },
    );
  }

  return (
    <div className="page-container">
      <ReportTabs />
      <PageHero
        compact
        compactOnMobile
        title={t("title")}
        description={t("description")}
        actions={(
          // One control, as on the other tabs: two squeezed the title to a
          // letter per line on phones. "Manage plans" sits under the plan mix.
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger aria-label={tDashboard("toolbar.period")} className="h-10 w-[10.5rem] rounded-xl border-border/70 bg-background/90 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_PERIODS.map((key) => (
                <SelectItem key={key} value={key}>{tDashboard(`toolbar.periods.${key}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {error && !data ? (
        <ErrorState title={t("failedToLoadDashboardData")} onRetry={() => { void refetch(); }} />
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
            <PlanMix className="xl:col-span-7" plans={data.plans} currency={data.currency} locale={locale} />
            <RenewalsDue className="xl:col-span-5" renewals={data.renewals} currency={data.currency} locale={locale} />
          </div>

          <div className="grid gap-6 xl:grid-cols-12">
            <StartedLostChart className="xl:col-span-7" activity={data.activity} locale={locale} />
            <PayingCustomers className="xl:col-span-5" conversion={data.conversion} locale={locale} />
          </div>
        </div>
      )}
    </div>
  );
}
