"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { useLocale, useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  CircleDollarSign, Clock, CheckCircle2, Wallet,
  CalendarDays, RotateCcw, Users, TrendingUp,
} from "lucide-react";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { formatCount } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyItem {
  month: number;
  total: number;
  pending: number;
  approved: number;
  paid: number;
  count: number;
}

interface QuarterlyItem {
  label: string;
  total: number;
  approved: number;
  paid: number;
  count: number;
}

interface TypeBreakdown {
  type: string;
  amount: number;
  count: number;
  percent: number;
}

interface AgentRow extends Record<string, unknown> {
  agentId: string;
  agentName: string;
  agentEmail: string;
  superAgentId: string;
  superAgentName: string;
  total: number;
  pending: number;
  approved: number;
  paid: number;
  count: number;
  avgRate: number;
}

interface Summary {
  totalCommissions: number;
  totalPending: number;
  totalApproved: number;
  totalPaid: number;
  totalDisputed: number;
  totalClawedBack: number;
  avgRate: number;
  currency: string;
}

interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

interface ReportData {
  year: number;
  summary: Summary;
  /** Every currency the year holds; the rest of the payload covers `summary.currency` only. */
  currencies: CurrencyTotal[];
  monthlyTrend: MonthlyItem[];
  quarterlyBreakdown: QuarterlyItem[];
  typeBreakdown: TypeBreakdown[];
  agentBreakdown: AgentRow[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TYPE_LABEL_KEYS: Record<string, "placementType" | "overrideType" | "bonusType"> = {
  placement: "placementType",
  override: "overrideType",
  bonus: "bonusType",
};

const TYPE_COLORS: Record<string, string> = {
  placement: "#6366f1",
  override: "#f59e0b",
  bonus: "#10b981",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
};

/* Every amount carries the currency the API reports for it — this used to
   default to "AED", which is how an INR year was labelled AED. */
function fmt(value: number, currency: string, locale: string, notation: "compact" | "standard" = "compact"): string {
  return formatCount(value, { style: "currency", currency, notation, maximumFractionDigits: notation === "compact" ? 1 : 0 }, locale);
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("adminCommissionsReport");
  const statusLabel = status === "pending" ? t("pending") : status === "approved" ? t("approved") : t("paidOut");
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[status] ?? "bg-muted text-muted-foreground"}`}>
      {statusLabel}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminCommissionsReportPage() {
  const t = useTranslations("adminCommissionsReport");
  const ta = useTranslations("a11y");
  const locale = useLocale();
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(currentYear);
  // Null lets the API pick the year's largest currency.
  const [currencyFilter, setCurrencyFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);

  const monthsShort = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2020, i, 1))));
  }, [locale]);

  /* A failed load shows an error with a retry. It used to leave the table
     saying "No commission data for 2026", which read as a fact. */
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const params = new URLSearchParams({ year: String(yearFilter) });
      if (currencyFilter) params.set("currency", currencyFilter);
      const res = await fetch(`/api/admin/commissions-report?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setData(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [yearFilter, currencyFilter]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Filtered agent breakdown
  const filteredAgents = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.toLowerCase();
    if (!q) return data.agentBreakdown;
    return data.agentBreakdown.filter(
      (a) =>
        a.agentName.toLowerCase().includes(q) ||
        a.agentEmail.toLowerCase().includes(q) ||
        a.superAgentName.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  const s = data?.summary;
  const currency = s?.currency ?? "AED";
  const money = (value: number, notation: "compact" | "standard" = "compact") => fmt(value, currency, locale, notation);
  const typeLabel = (type: string) => (TYPE_LABEL_KEYS[type] ? t(TYPE_LABEL_KEYS[type]) : type);

  // Export config — the amount headers name the currency the rows are in.
  const exportColumns: ExportColumn<AgentRow>[] = [
    { header: t("exportHeaderAgent"), key: "agentName" },
    { header: t("exportHeaderEmail"), key: "agentEmail" },
    { header: t("exportHeaderSuperAgent"), key: "superAgentName" },
    { header: t("exportHeaderTotal", { currency }), key: "total" },
    { header: t("exportHeaderPending", { currency }), key: "pending" },
    { header: t("exportHeaderApproved", { currency }), key: "approved" },
    { header: t("exportHeaderPaid", { currency }), key: "paid" },
    { header: t("exportHeaderCommissionCount"), key: "count" },
    { header: t("exportHeaderAvgRate"), key: "avgRate" },
  ];
  const { handleExportCsv, handleExportExcel } = useTableExport({ data: filteredAgents, columns: exportColumns, filename: `commissions-report-${yearFilter}-${currency}` });

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // Stable data keys; the translated names go on the <Bar name>. recharts reads
  // a dot in a dataKey as a path, so a translated key can empty the chart.
  const chartData = data?.monthlyTrend.map((m) => ({
    name: monthsShort[m.month - 1],
    pending: m.pending,
    approved: m.approved,
    paid: m.paid,
  })) ?? [];

  const pieData = data?.typeBreakdown.map((item) => ({
    name: typeLabel(item.type),
    value: item.amount,
    color: TYPE_COLORS[item.type] ?? "#94a3b8",
  })) ?? [];

  return (
    <div className="page-container">
      <ReportTabs />
      <DashboardPageHeader
        compact
        compactOnMobile
        title={t("commissionReportTitle")}
        description={t("reportDescription", { year: yearFilter })}
        actions={(
          <>
            <Select value={String(yearFilter)} onValueChange={(v) => setYearFilter(Number(v))}>
              <SelectTrigger aria-label={t("yearFilterLabel")} className="h-10 w-28 rounded-xl border-border/70 bg-background/90">
                <CalendarDays className="mr-1.5 h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Only when the year holds more than one currency: amounts in
                different currencies are shown one currency at a time. */}
            {data && data.currencies.length > 1 ? (
              <Select value={currency} onValueChange={setCurrencyFilter}>
                <SelectTrigger aria-label={t("currencyFilterLabel")} className="h-10 w-28 rounded-xl border-border/70 bg-background/90">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.currencies.map((row) => (
                    <SelectItem key={row.currency} value={row.currency}>{row.currency}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button aria-label={ta("refresh")} variant="outline" size="icon" onClick={fetchReport} disabled={loading} className="rounded-xl border-border/70 bg-background/90">
              <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        )}
        metrics={[
          { label: t("totalCommissions"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? money(s.totalCommissions) : "—", icon: CircleDollarSign, iconClassName: "text-indigo-600", iconSurfaceClassName: "bg-indigo-50" },
          { label: t("pending"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? money(s.totalPending) : "—", icon: Clock, iconClassName: "text-amber-600", iconSurfaceClassName: "bg-amber-50" },
          { label: t("approved"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? money(s.totalApproved) : "—", icon: CheckCircle2, iconClassName: "text-blue-600", iconSurfaceClassName: "bg-blue-50" },
          { label: t("paidOut"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? money(s.totalPaid) : "—", icon: Wallet, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50" },
          { label: t("avgRate"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? `${s.avgRate}%` : "—", icon: TrendingUp, iconClassName: "text-violet-600", iconSurfaceClassName: "bg-violet-50" },
        ]}
      />

      {loadFailed ? (
        <ErrorState title={t("failedToLoadReport")} onRetry={() => { void fetchReport(); }} />
      ) : (
        <>
      {/* ── Monthly Trend Chart + Type Breakdown ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2 workspace-panel-surface rounded-2xl panel-body">
          <h2 className="heading-label mb-4 font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("monthlyTrendTitle", { year: yearFilter })}</h2>
          {/* The axes are laid out left-to-right in both locales; under RTL the
              tick labels anchored the wrong way and ran into the axis line. */}
          <div className="[direction:ltr]">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              {/* Compact notation scales with the data; dividing by 1000
                  unconditionally printed "0K" down the whole axis. */}
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatCount(v, { notation: "compact", maximumFractionDigits: 1 }, locale)} />
              <ReTooltip formatter={(v) => money(Number(v), "standard")} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="pending" name={t("pending")} fill="#fbbf24" radius={[3, 3, 0, 0]} />
              <Bar dataKey="approved" name={t("approved")} fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="paid" name={t("paidOut")} fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </section>

        <section className="workspace-panel-surface rounded-2xl panel-body">
          <h2 className="heading-label mb-4 font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("byTypeTitle")}</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <ReTooltip formatter={(v) => money(Number(v), "standard")} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{t("noData")}</div>
          )}
          <div className="mt-2 space-y-1.5">
            {data?.typeBreakdown.map((typeItem) => (
              <div key={typeItem.type} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 capitalize">
                  <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[typeItem.type] ?? "#94a3b8" }} />
                  {typeLabel(typeItem.type)}
                </span>
                <span className="font-medium">{typeItem.percent}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Quarterly Breakdown ── */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.quarterlyBreakdown.map((q) => (
            <div key={q.label} className="workspace-glass-panel card-pad rounded-2xl">
              <p className="text-xs font-semibold text-muted-foreground">{q.label}</p>
              <p className="mt-1 text-lg font-bold">{money(q.total)}</p>
              <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                <span>{t("quarterlyBreakdownCommissionsLabel", { count: q.count })}</span>
              </div>
              <div className="mt-1 flex gap-1">
                <StatusBadge status="approved" />
                <span className="text-xs">{money(q.approved)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Agent Breakdown Table ── */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="heading-label font-semibold">{t("agentBreakdownTitle")}</h2>
          {data && <Badge variant="secondary">{t("agentsCount", { count: data.agentBreakdown.length })}</Badge>}
        </div>
        <InlineFilterBar
          className="border-b px-4 py-3"
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
        >
          <InlineFilterSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t("searchPlaceholder")}
          />
        </InlineFilterBar>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("agentTableHeader")}</TableHead>
                <TableHead>{t("superAgentTableHeader")}</TableHead>
                <TableHead className="text-right">{t("totalTableHeader")}</TableHead>
                <TableHead className="text-right">{t("pendingTableHeader")}</TableHead>
                <TableHead className="text-right">{t("approvedTableHeader")}</TableHead>
                <TableHead className="text-right">{t("paidTableHeader")}</TableHead>
                <TableHead className="text-right">{t("countTableHeader")}</TableHead>
                <TableHead className="text-right">{t("avgRateTableHeader")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredAgents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    {t("noCommissionData", { year: yearFilter })}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAgents.map((agent) => (
                  <TableRow key={agent.agentId}>
                    <TableCell>
                      <div className="font-medium">{agent.agentName}</div>
                      <div className="text-xs text-muted-foreground">{agent.agentEmail}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{agent.superAgentName || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{money(agent.total, "standard")}</TableCell>
                    <TableCell className="text-right text-amber-600">{money(agent.pending, "standard")}</TableCell>
                    <TableCell className="text-right text-indigo-600">{money(agent.approved, "standard")}</TableCell>
                    <TableCell className="text-right text-emerald-600">{money(agent.paid, "standard")}</TableCell>
                    <TableCell className="text-right">{agent.count}</TableCell>
                    <TableCell className="text-right">{agent.avgRate ? `${Number(agent.avgRate).toFixed(1)}%` : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
