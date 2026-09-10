"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  CircleDollarSign, Clock, Sparkles, BarChart3,
  CalendarDays, RotateCcw, Users,
} from "lucide-react";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  SuperAgentPageIntro,
  SuperAgentEmptyState,
} from "@/components/features/super-agent/WorkspacePage";
import { formatCount } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyItem {
  month: number;
  overrideTotal: number;
  overridePending: number;
  overrideApproved: number;
  overridePaid: number;
  teamTotal: number;
  teamApproved: number;
}

interface AgentRow extends Record<string, unknown> {
  agentId: string;
  agentName: string;
  agentEmail: string;
  total: number;
  pending: number;
  approved: number;
  paid: number;
  count: number;
}

interface OverviewSummary {
  overrideTotal: number;
  overridePending: number;
  overrideApproved: number;
  overridePaid: number;
  teamTotal: number;
  grandTotal: number;
  currency: string;
}

interface CurrencyTotal {
  currency: string;
  overrideTotal: number;
  teamTotal: number;
  grandTotal: number;
}

interface ReportData {
  year: number;
  overviewSummary: OverviewSummary;
  monthlyTrend: MonthlyItem[];
  agentBreakdown: AgentRow[];
  /* Every currency the year holds. The rest of the page reports the dominant
     one only, so this is what stops the other totals disappearing silently. */
  byCurrency?: CurrencyTotal[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Months will be translated in component using t() function
const getMonthsShort = (t: ReturnType<typeof useTranslations>) => [
  t("monthJanuary"),
  t("monthFebruary"),
  t("monthMarch"),
  t("monthApril"),
  t("monthMay"),
  t("monthJune"),
  t("monthJuly"),
  t("monthAugust"),
  t("monthSeptember"),
  t("monthOctober"),
  t("monthNovember"),
  t("monthDecember"),
];

function fmt(value: number, currency = "AED"): string {
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${formatCount(value)}`;
}

/* Axis ticks carry no currency (the legend and tooltip do) and must not
   collapse every real figure to "0K" — the old formatter divided by 1000
   unconditionally, so a 12-month axis of small amounts read 0K five times. */
function axisTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

/* Validated with the dataviz palette checker against the white card surface:
   lightness band, chroma floor, CVD separation (dE 9.2 deutan / 12.2 tritan),
   normal-vision separation and >=3:1 contrast all pass. The old sky #0ea5e9
   sat at 2.77:1 and failed the contrast check. */
const SERIES_OVERRIDE = "#7c3aed";
const SERIES_TEAM = "#0284c7";

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentCommissionsReportPage() {
  const t = useTranslations("superAgentCommissionsReport");
  const tc = useTranslations("common");
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-agent/commissions-report?year=${yearFilter}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        toast.error(t("failedToLoadReport"));
      }
    } catch {
      toast.error(t("failedToLoadReport"));
    } finally {
      setLoading(false);
    }
  }, [yearFilter, t]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const filteredAgents = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.agentBreakdown;
    return data.agentBreakdown.filter(
      (a) => a.agentName.toLowerCase().includes(q) || a.agentEmail.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  const s = data?.overviewSummary;
  const currency = s?.currency ?? "AED";

  const exportColumns: ExportColumn<AgentRow>[] = [
    { header: t("columnAgent"), key: "agentName" },
    { header: tc("email"), key: "agentEmail" },
    // Headers used to hard-code "(AED)" while the figures came back in whatever
    // currency dominated the year — an INR export was labelled AED.
    { header: t("columnWithCurrency", { label: t("tableColumnTotal"), currency }), key: "total" },
    { header: t("columnWithCurrency", { label: t("tableColumnPending"), currency }), key: "pending" },
    { header: t("columnWithCurrency", { label: t("tableColumnApproved"), currency }), key: "approved" },
    { header: t("columnWithCurrency", { label: t("tableColumnPaid"), currency }), key: "paid" },
    { header: t("columnCount"), key: "count" },
  ];
  const { handleExportCsv, handleExportExcel } = useTableExport({ data: filteredAgents, columns: exportColumns, filename: `sa-commissions-${yearFilter}` });

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const monthsShort = getMonthsShort(t);
  // Stable data keys, translated series names. Building the keys out of t()
  // put locale text on the dataKey, and recharts reads a dot in a dataKey as a
  // deep path — one translated label with a full stop empties the chart.
  const chartData = data?.monthlyTrend.map((m) => ({
    name: monthsShort[m.month - 1],
    override: m.overrideTotal,
    team: m.teamTotal,
  })) ?? [];
  const hasChartData = chartData.some((d) => d.override > 0 || d.team > 0);

  const otherCurrencies = (data?.byCurrency ?? []).filter(
    (c) => c.currency !== currency && c.grandTotal > 0,
  );

  const teamTotals = useMemo(() => filteredAgents.reduce(
    (acc, a) => ({
      total: acc.total + a.total,
      pending: acc.pending + a.pending,
      approved: acc.approved + a.approved,
      paid: acc.paid + a.paid,
      count: acc.count + a.count,
    }),
    { total: 0, pending: 0, approved: 0, paid: 0, count: 0 },
  ), [filteredAgents]);

  const hasAgents = (data?.agentBreakdown.length ?? 0) > 0;
  // A dash while the figures load, not an absent strip: passing [] made the
  // whole metric band appear only after the fetch and shifted the page down.
  const metricValue = (value: number) => (s ? fmt(value, currency) : "—");

  return (
    <div className="page-container">
      {/* ── Hero Section ──
          Four metrics, not five: every other super-agent header runs a single
          row of four (188px desktop / ~150px phone), and a fifth wrapped this
          one to two rows at 238px. "My override" is the figure that was missing
          — it is the super-agent's own money and the subject of the chart — so
          "Override paid" gives up the slot; per-payout status lives on the
          commissions list. "Pending" is renamed because, sitting beside "Team
          earned", it read as the team's pipeline, which it is not. */}
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        metrics={[
          { label: t("kpiGrandTotal"), value: metricValue(s?.grandTotal ?? 0), icon: CircleDollarSign },
          { label: t("kpiMyOverride"), value: metricValue(s?.overrideTotal ?? 0), icon: Sparkles },
          { label: t("kpiTeamEarned"), value: metricValue(s?.teamTotal ?? 0), icon: Users },
          { label: t("kpiOverridePending"), value: metricValue(s?.overridePending ?? 0), icon: Clock },
        ]}
        compact
      >
        <div className="flex items-center gap-2">
          <Select value={String(yearFilter)} onValueChange={(v) => setYearFilter(Number(v))}>
            <SelectTrigger className="h-10 w-28 rounded-xl border-border/70 bg-background/90" aria-label={t("yearFilterLabel")}>
              <CalendarDays className="mr-1.5 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchReport} disabled={loading} className="rounded-xl border-border/70 bg-background/90" aria-label={t("refreshReport")}>
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </SuperAgentPageIntro>

      {otherCurrencies.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {t("otherCurrenciesNote", {
            currency,
            others: otherCurrencies.map((c) => fmt(c.grandTotal, c.currency)).join(" · "),
          })}
        </p>
      )}

      {/* ── Monthly Trend ── */}
      <section className="workspace-panel-surface rounded-2xl sm:rounded-3xl panel-body">
        {/* Same head shape as the table panel below. The two used to disagree —
            one uppercase muted kicker, one sentence-case heading. */}
        <div className="mb-4 flex items-start gap-2">
          <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="heading-label font-semibold">{t("monthlyTrendTitle")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("monthlyTrendCaption")}</p>
          </div>
        </div>
        {loading ? (
          <div className="h-[260px] animate-pulse rounded-xl bg-muted" />
        ) : hasChartData ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} allowDecimals={false} tickFormatter={axisTick} />
              <ReTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(v) => fmt(v as number, currency)}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
              <Bar dataKey="override" name={t("chartMyOverride")} fill={SERIES_OVERRIDE} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="team" name={t("chartTeamTotal")} fill={SERIES_TEAM} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          // An all-zero year used to render a full grid with five "0K" ticks and
          // no bars, which looks like a broken chart rather than an empty year.
          <SuperAgentEmptyState
            icon={<BarChart3 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
            title={t("chartEmptyTitle", { year: yearFilter })}
            description={t("chartEmptyDescription")}
          />
        )}
      </section>

      {/* ── Agent Breakdown Table ── */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-3xl">
        <div className="flex max-sm:flex-col items-center max-sm:items-start justify-between max-sm:justify-start gap-3 panel-head">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="heading-label font-semibold">{t("teamBreakdownTitle")}</h2>
            {data && <Badge variant="secondary">{t("agentsCount", { count: data.agentBreakdown.length })}</Badge>}
          </div>
          {/* Search over nothing and an export that writes a header-only file
              are dead controls — the toolbar appears once there is data. */}
          {hasAgents && (
            <div className="max-sm:w-full">
              <TableToolbar
                search={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder={t("searchAgentPlaceholder")}
                onExportCsv={handleExportCsv}
                onExportExcel={handleExportExcel}
              />
            </div>
          )}
        </div>
        {!loading && !hasAgents ? (
          <SuperAgentEmptyState
            icon={<Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
            title={t("noTeamDataMessage", { year: yearFilter })}
            description={t("noTeamDataDescription")}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableColumnAgent")}</TableHead>
                  <TableHead className="text-right">{t("tableColumnTotal")}</TableHead>
                  <TableHead className="text-right">{t("tableColumnPending")}</TableHead>
                  <TableHead className="text-right">{t("tableColumnApproved")}</TableHead>
                  <TableHead className="text-right">{t("tableColumnPaid")}</TableHead>
                  <TableHead className="text-right">{t("tableColumnCount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}><div className="h-4 w-full animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredAgents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {/* A search that matches nothing is not an empty year. */}
                      {t("noSearchMatch", { query: searchQuery.trim() })}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAgents.map((agent) => (
                    <TableRow key={agent.agentId}>
                      <TableCell>
                        <div className="font-medium">{agent.agentName}</div>
                        <div className="text-xs text-muted-foreground">{agent.agentEmail}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(agent.total, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600">{fmt(agent.pending, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums text-indigo-600">{fmt(agent.approved, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{fmt(agent.paid, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(agent.count)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {!loading && filteredAgents.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">{t("tableTotalRow")}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmt(teamTotals.total, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(teamTotals.pending, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(teamTotals.approved, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(teamTotals.paid, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(teamTotals.count)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
