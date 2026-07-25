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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  CircleDollarSign, Clock, CheckCircle2, Wallet,
  CalendarDays, RotateCcw, Users, Layers,
} from "lucide-react";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid,
} from "@/components/features/super-agent/WorkspacePage";

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

interface ReportData {
  year: number;
  overviewSummary: OverviewSummary;
  monthlyTrend: MonthlyItem[];
  agentBreakdown: AgentRow[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(value: number, currency = "AED"): string {
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${value.toLocaleString()}`;
}

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
    const q = searchQuery.toLowerCase();
    if (!q) return data.agentBreakdown;
    return data.agentBreakdown.filter(
      (a) => a.agentName.toLowerCase().includes(q) || a.agentEmail.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  const exportColumns: ExportColumn<AgentRow>[] = [
    { header: t("columnAgent"), key: "agentName" },
    { header: tc("email"), key: "agentEmail" },
    { header: t("columnTotalAed"), key: "total" },
    { header: t("columnPendingAed"), key: "pending" },
    { header: t("columnApprovedAed"), key: "approved" },
    { header: t("columnPaidAed"), key: "paid" },
    { header: t("columnCount"), key: "count" },
  ];
  const { handleExportCsv, handleExportExcel } = useTableExport({ data: filteredAgents, columns: exportColumns, filename: `sa-commissions-${yearFilter}` });

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const chartData = data?.monthlyTrend.map((m) => ({
    name: MONTHS_SHORT[m.month - 1],
    [t("chartMyOverride")]: m.overrideTotal,
    [t("chartTeamTotal")]: m.teamTotal,
  })) ?? [];

  const s = data?.overviewSummary;

  return (
    <div className="page-container space-y-6">
      {/* ── Hero Section ── */}
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription", { year: yearFilter })}
        eyebrow={t("pageEyebrow")}
        summaryTitle={t("summaryTitle")}
        summaryDescription={s ? t("summaryDescription", { grandTotal: fmt(s.grandTotal, s.currency), overrideTotal: fmt(s.overrideTotal, s.currency) }) : t("loadingData")}
      >
        <div className="flex items-center gap-2">
          <Select value={String(yearFilter)} onValueChange={(v) => setYearFilter(Number(v))}>
            <SelectTrigger className="h-10 w-28 rounded-xl border-border/70 bg-background/90">
              <CalendarDays className="mr-1.5 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchReport} disabled={loading} className="h-10 w-10 rounded-xl border-border/70 bg-background/90">
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </SuperAgentPageIntro>

      {/* ── KPI Cards ── */}
      <SuperAgentMetricsGrid
        items={[
          { label: t("kpiGrandTotal"), value: loading ? "—" : s ? fmt(s.grandTotal, s.currency) : "—", helper: t("kpiGrandTotalHelper"), icon: <CircleDollarSign className="h-5 w-5" />, toneClassName: "workspace-tone-indigo" },
          { label: t("kpiMyOverride"), value: loading ? "—" : s ? fmt(s.overrideTotal, s.currency) : "—", helper: t("kpiMyOverrideHelper"), icon: <Layers className="h-5 w-5" />, toneClassName: "workspace-tone-violet" },
          { label: t("kpiTeamEarned"), value: loading ? "—" : s ? fmt(s.teamTotal, s.currency) : "—", helper: t("kpiTeamEarnedHelper"), icon: <Users className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
          { label: tc("status"), value: loading ? "—" : s ? fmt(s.overridePending, s.currency) : "—", helper: t("kpiPendingHelper"), icon: <Clock className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
          { label: t("kpiOverridePaid"), value: loading ? "—" : s ? fmt(s.overridePaid, s.currency) : "—", helper: t("kpiOverridePaidHelper"), icon: <Wallet className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
        ]}
      />

      {/* ── Monthly Trend ── */}
      <section className="workspace-panel-surface rounded-2xl p-4 sm:rounded-[28px] sm:p-5 md:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("monthlyTrendHeading", { year: yearFilter })}</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
            <ReTooltip formatter={(v) => fmt(v as number)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey={t("chartMyOverride")} fill="#7c3aed" radius={[3, 3, 0, 0]} />
            <Bar dataKey={t("chartTeamTotal")} fill="#0ea5e9" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* ── Approved Breakdown ── */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: t("breakdownOverridePending"), value: s ? fmt(s.overridePending, s.currency) : "—", icon: Clock, color: "text-amber-600", chip: "bg-amber-50 dark:bg-amber-950/30" },
            { label: t("breakdownOverrideApproved"), value: s ? fmt(s.overrideApproved, s.currency) : "—", icon: CheckCircle2, color: "text-blue-600", chip: "bg-blue-50 dark:bg-blue-950/30" },
            { label: t("breakdownOverridePaid"), value: s ? fmt(s.overridePaid, s.currency) : "—", icon: Wallet, color: "text-emerald-600", chip: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: t("breakdownTeamTotalEarned"), value: s ? fmt(s.teamTotal, s.currency) : "—", icon: Users, color: "text-sky-600", chip: "bg-sky-50 dark:bg-sky-950/30" },
          ].map(({ label, value, icon: Icon, color, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${chip}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </span>
                <p className="text-xs font-semibold text-muted-foreground">{label}</p>
              </div>
              <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Agent Breakdown Table ── */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-[28px]">
        <div className="border-b border-border/60 px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t("teamBreakdownTitle")}</h2>
            {data && <Badge variant="secondary">{t("agentsCount", { count: data.agentBreakdown.length })}</Badge>}
          </div>
          <TableToolbar
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("searchAgentPlaceholder")}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
          />
        </div>
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
                    {t("noTeamDataMessage", { year: yearFilter })}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAgents.map((agent) => (
                  <TableRow key={agent.agentId}>
                    <TableCell>
                      <div className="font-medium">{agent.agentName}</div>
                      <div className="text-xs text-muted-foreground">{agent.agentEmail}</div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{fmt(agent.total)}</TableCell>
                    <TableCell className="text-right text-amber-600">{fmt(agent.pending)}</TableCell>
                    <TableCell className="text-right text-indigo-600">{fmt(agent.approved)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{fmt(agent.paid)}</TableCell>
                    <TableCell className="text-right">{agent.count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
