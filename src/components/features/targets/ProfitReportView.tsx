"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight, Briefcase, Building2, CalendarRange, CircleDollarSign, FileText, Gauge, Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { InlineFilterBar } from "@/components/shared/InlineFilterBar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPeriodRange, usePeriodNamer } from "./periodLabels";
import { ReportCardHeader, ReportEmpty, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { TrendLineChart } from "@/components/features/admin/reports/TrendLineChart";
import type { TargetReport, TeamRow } from "@/lib/targets/profitReport";
import { IncomeSourcesList } from "./IncomeSourcesList";
import { IncentiveTierBadge, KpiCard, MonthlyDistributionGrid } from "./TargetComponents";
import { PACE_CHIP, PACE_LABEL_KEYS } from "./pace";
import { TargetHeadline, TargetInsightTiles, headlineOfReport } from "./TargetProgress";
import { formatProfit, monthName, shareOf } from "./profitFormat";
import { formatCount } from "@/lib/ui/intlFormat";

const TARGET_COLOR = "#94a3b8";
const PROFIT_COLOR = "#059669";

/**
 * One profit target report, whoever is looking: an agent at their own, a super
 * agent at their own with the team underneath, admin at either. The API decides
 * who may load which report; this only draws it.
 */
export function ProfitReportView({ report, onSelectAgent, headline = "full", className = "" }: {
  report: TargetReport;
  /** Super agents and admin: open one agent's report from the team table. */
  onSelectAgent?: (agent: TeamRow) => void;
  /**
   * `full` opens with the target's status, growth, target bar and insights. A page that
   * already shows the status and bar around this report asks for `tiles`, the insights only.
   */
  headline?: "full" | "tiles";
  className?: string;
}) {
  const t = useTranslations("profitReport");
  const locale = useLocale();
  const { summary, drivers, currency } = report;
  const money = (value: number, notation: "standard" | "compact" = "standard") => formatProfit(value, currency, locale, notation);
  const count = (value: number) => formatCount(value, undefined, locale);
  const namePeriod = usePeriodNamer();
  const hasTarget = summary.profitTarget > 0;
  const commissionShare = shareOf(drivers.commissionCost, drivers.revenue);

  const points = report.months.map((month) => ({
    month: `${report.year}-${String(month.month).padStart(2, "0")}`,
    values: { target: month.profitTarget, achieved: month.profitAchieved },
  }));
  const hasChartData = points.some((point) => point.values.target > 0 || point.values.achieved > 0);
  const growth = report.previousYear.growthPct;

  const exportRows = useMemo(() => report.months.map((month) => ({
    month: monthName(month.month, locale),
    profitTarget: month.profitTarget,
    profitAchieved: month.profitAchieved,
    revenue: month.revenue,
    commissionCost: month.commissionCost,
    invoicesPaid: month.invoicesPaid,
    placements: month.placements,
    newEmployers: month.newEmployers,
  })), [report.months, locale]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = useMemo(() => [
    { header: t("exportMonth"), key: "month" },
    { header: t("exportProfitTarget", { currency }), key: "profitTarget" },
    { header: t("exportProfitAchieved", { currency }), key: "profitAchieved" },
    { header: t("exportRevenue", { currency }), key: "revenue" },
    { header: t("exportCommission", { currency }), key: "commissionCost" },
    { header: t("exportInvoices"), key: "invoicesPaid" },
    { header: t("exportPlacements"), key: "placements" },
    { header: t("exportEmployers"), key: "newEmployers" },
  ], [t, currency]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: exportRows as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: `profit-target-report-${report.year}-${(report.person.name || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: t("exportTitle", { name: report.person.name || t("unknownPerson"), year: report.year }),
  });

  return (
    <div className={`space-y-6 ${className}`}>
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0 print:hidden"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        exportExtra={(
          <DropdownMenuItem onClick={() => window.print()}>
            <FileText className="h-4 w-4" />
            {t("print")}
          </DropdownMenuItem>
        )}
      >
        <p className="text-sm font-medium text-foreground">
          {report.person.name || t("unknownPerson")}
          <span className="text-muted-foreground"> · {report.year} · {currency}</span>
        </p>
      </InlineFilterBar>

      {headline === "full" ? (
        <section className={reportCardClassName} aria-label={t("headlineTitle")}>
          <ReportCardHeader
            title={t("headlineTitle")}
            description={t("headlineDescription", { year: report.year })}
            icon={Gauge}
            tone="workspace-tone-emerald"
          />
          <TargetHeadline data={headlineOfReport(report)} className="mt-4" />
        </section>
      ) : (
        <TargetInsightTiles data={headlineOfReport(report)} />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("kpiProfit")}
          value={money(summary.profitAchieved)}
          subtext={hasTarget ? t("kpiProfitOfTarget", { target: money(summary.profitTarget) }) : t("kpiProfitNoTarget")}
          icon={<CircleDollarSign className="h-5 w-5" />}
          toneClassName="workspace-tone-emerald"
        />
        <KpiCard
          label={t("kpiRevenue")}
          value={money(drivers.revenue)}
          subtext={t("kpiRevenueHint")}
          icon={<Wallet className="h-5 w-5" />}
          toneClassName="workspace-tone-sky"
        />
        <KpiCard
          label={t("kpiCommission")}
          value={money(drivers.commissionCost)}
          subtext={commissionShare === null ? t("kpiCommissionNone") : t("kpiCommissionShare", { percent: commissionShare })}
          icon={<Receipt className="h-5 w-5" />}
          toneClassName="workspace-tone-amber"
        />
        <KpiCard
          label={t("kpiProgress")}
          value={hasTarget ? `${summary.profitProgress}%` : "—"}
          subtext={(
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PACE_CHIP[summary.pace]}`}>
                {t(PACE_LABEL_KEYS[summary.pace])}
              </span>
              <span>{t("kpiExpected", { expected: summary.expectedProgress, year: report.year })}</span>
              <IncentiveTierBadge tier={summary.incentiveTier} />
            </span>
          )}
          icon={<Gauge className="h-5 w-5" />}
          toneClassName={summary.pace === "behind" ? "workspace-tone-rose" : "workspace-tone-emerald"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className={`${reportCardClassName} xl:col-span-7`} aria-label={t("monthlyTitle")}>
          <ReportCardHeader
            title={t("monthlyTitle")}
            description={t("monthlyDescription", { year: report.year })}
            icon={TrendingUp}
            tone="workspace-tone-sky"
          />
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: TARGET_COLOR }} /> {t("seriesTarget")}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PROFIT_COLOR }} /> {t("seriesProfit")}
            </span>
            <span>{t("amountsIn", { currency })}</span>
          </div>
          {hasChartData ? (
            <div className="mt-4 flex flex-1 items-center rounded-2xl border border-border/70 bg-secondary/30 p-3">
              <TrendLineChart
                series={[
                  { key: "target", color: TARGET_COLOR, dashed: true },
                  { key: "achieved", color: PROFIT_COLOR },
                ]}
                points={points}
                locale={locale}
                ariaLabel={t("chartAria", { year: report.year })}
                formatTick={(value) => money(value, "compact")}
              />
            </div>
          ) : (
            <ReportEmpty>{t("noMonthlyData", { year: report.year })}</ReportEmpty>
          )}
        </section>

        <section className={`${reportCardClassName} xl:col-span-5`} aria-label={t("sourcesTitle")}>
          <ReportCardHeader
            title={t("sourcesTitle")}
            description={t("sourcesDescription")}
            icon={Briefcase}
            tone="workspace-tone-violet"
          />
          <IncomeSourcesList byCategory={report.byCategory} currency={currency} emptyLabel={t("noSources", { year: report.year })} />

          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("previousYear", { year: report.previousYear.year })}
              </p>
              <p className="text-sm font-semibold tabular-nums">{money(report.previousYear.profit)}</p>
            </div>
            {growth === null ? (
              <span className="text-xs text-muted-foreground">{t("noComparison")}</span>
            ) : (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${growth >= 0 ? PACE_CHIP.achieved : PACE_CHIP.behind}`}>
                {growth >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {t("growth", { percent: `${growth >= 0 ? "+" : "−"}${Math.abs(growth)}` })}
              </span>
            )}
          </div>
        </section>
      </div>

      <section className={reportCardClassName} aria-label={t("driversTitle")}>
        <ReportCardHeader
          title={t("driversTitle")}
          description={t("driversDescription", { year: report.year })}
          icon={Building2}
          tone="workspace-tone-sky"
        />
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {([
            ["driverInvoices", drivers.invoicesPaid],
            ["driverPlacements", drivers.placements],
            ["driverEmployers", drivers.newEmployers],
          ] as const).map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(key)}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{count(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {report.schedule.periodType !== "monthly" && report.schedule.periods.length > 0 ? (
        <section className={reportCardClassName} aria-label={t("scheduleTitle")}>
          <ReportCardHeader
            title={t("scheduleTitle")}
            description={t("scheduleDescription", { type: t(`period_${report.schedule.periodType}`).toLowerCase() })}
            icon={CalendarRange}
            tone="workspace-tone-sky"
          />
          <div className={`mt-4 overflow-x-auto rounded-2xl border border-border/70 ${report.schedule.periods.length > 12 ? "max-h-96 overflow-y-auto" : ""}`}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>{t("columnPeriod")}</TableHead>
                  <TableHead>{t("columnProgress")}</TableHead>
                  <TableHead className="text-end">{t("columnProfit")}</TableHead>
                  <TableHead>{t("columnStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.schedule.periods.map((period, index) => (
                  <TableRow key={`${period.startDate}-${index}`} className={period.status === "current" ? "bg-primary/[0.04]" : ""}>
                    <TableCell className="min-w-36">
                      <p className="font-medium">{namePeriod(period, report.schedule.periodType, index, report.year)}</p>
                      <p className="text-xs text-muted-foreground">{formatPeriodRange(period, locale)}</p>
                    </TableCell>
                    <TableCell className="min-w-36">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                          <span
                            className={`block h-full rounded-full ${period.status === "past" && period.profitProgress < 100 ? "bg-rose-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(100, period.profitProgress)}%` }}
                          />
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{period.profitTarget > 0 ? `${period.profitProgress}%` : "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {money(period.profitAchieved)}
                      <p className="text-xs text-muted-foreground">{t("ofTarget", { target: money(period.profitTarget) })}</p>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {t(`status_${period.status}`)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <section className={reportCardClassName} aria-label={t("monthsTitle")}>
        <ReportCardHeader
          title={t("monthsTitle")}
          description={t("monthsDescription")}
          icon={TrendingUp}
          tone="workspace-tone-emerald"
        />
        <div className="mt-4">
          <MonthlyDistributionGrid
            currency={currency}
            months={report.months.map((month) => ({
              month: month.month,
              profitTarget: month.profitTarget,
              profitAchieved: month.profitAchieved,
              profitProgress: month.profitTarget > 0 ? Math.min(Math.round((month.profitAchieved / month.profitTarget) * 100), 999) : 0,
            }))}
          />
        </div>
      </section>

      {report.team ? (
        <section className={reportCardClassName} aria-label={t("teamTitle")}>
          <ReportCardHeader
            title={t("teamTitle")}
            description={t("teamDescription", { year: report.year })}
            icon={Users}
            tone="workspace-tone-violet"
          />
          {report.team.rows.length === 0 ? (
            <ReportEmpty>{t("noTeam", { year: report.year })}</ReportEmpty>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>{t("columnAgent")}</TableHead>
                    <TableHead>{t("columnProgress")}</TableHead>
                    <TableHead className="text-end">{t("columnProfit")}</TableHead>
                    <TableHead className="text-end">{t("columnShare")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.team.rows.map((row) => (
                    <TableRow key={row.profileId}>
                      <TableCell className="min-w-44">
                        {onSelectAgent ? (
                          <button
                            type="button"
                            onClick={() => onSelectAgent(row)}
                            className="text-start font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {row.name || row.email || t("unknownPerson")}
                          </button>
                        ) : (
                          <span className="font-medium">{row.name || row.email || t("unknownPerson")}</span>
                        )}
                        {row.region ? <p className="text-xs text-muted-foreground">{row.region}</p> : null}
                      </TableCell>
                      <TableCell className="min-w-40">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                            <span
                              className={`block h-full rounded-full ${row.pace === "behind" ? "bg-rose-500" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(100, row.profitProgress)}%` }}
                            />
                          </span>
                          <span className="text-sm font-semibold tabular-nums">{row.profitProgress}%</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PACE_CHIP[row.pace]}`}>
                            {t(PACE_LABEL_KEYS[row.pace])}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {money(row.profitAchieved)}
                        <p className="text-xs text-muted-foreground">{t("ofTarget", { target: money(row.profitTarget) })}</p>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{row.shareOfTeam}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {report.team.otherProfit > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("otherProfit", { amount: money(report.team.otherProfit) })}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
