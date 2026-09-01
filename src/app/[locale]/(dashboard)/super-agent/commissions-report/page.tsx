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
  CircleDollarSign, Clock, Wallet,
  CalendarDays, RotateCcw, Users,
} from "lucide-react";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  SuperAgentPageIntro,
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
  return `${currency} ${formatCount(value)}`;
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
    <div className="page-container">
      {/* ── Hero Section ── */}
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription", { year: yearFilter })}
        eyebrow={t("pageEyebrow")}
        metrics={s ? [
          { label: t("kpiGrandTotal"), value: fmt(s.grandTotal, s.currency), icon: CircleDollarSign },
          { label: t("kpiTeamEarned"), value: fmt(s.teamTotal, s.currency), icon: Users },
          { label: t("kpiPending"), value: fmt(s.overridePending, s.currency), icon: Clock },
          { label: t("kpiOverridePaid"), value: fmt(s.overridePaid, s.currency), icon: Wallet },
        ] : []}
        compact
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
          <Button variant="outline" size="icon" onClick={fetchReport} disabled={loading} className="rounded-xl border-border/70 bg-background/90">
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </SuperAgentPageIntro>

      {/* ── Monthly Trend ── */}
      <section className="workspace-panel-surface rounded-2xl sm:rounded-3xl panel-body">
        <h2 className="heading-label mb-4 font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("monthlyTrendHeading", { year: yearFilter })}</h2>
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

      {/* ── Agent Breakdown Table ── */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-3xl">
        <div className="flex max-sm:flex-col items-center max-sm:items-start justify-between max-sm:justify-start gap-3 panel-head">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="heading-label font-semibold">{t("teamBreakdownTitle")}</h2>
            {data && <Badge variant="secondary">{t("agentsCount", { count: data.agentBreakdown.length })}</Badge>}
          </div>
          <div className="max-sm:w-full">
            <TableToolbar
              search={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder={t("searchAgentPlaceholder")}
              onExportCsv={handleExportCsv}
              onExportExcel={handleExportExcel}
            />
          </div>
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
