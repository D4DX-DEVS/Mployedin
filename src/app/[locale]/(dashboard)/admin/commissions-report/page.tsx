"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
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
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  CircleDollarSign, Clock, CheckCircle2, Wallet,
  CalendarDays, RotateCcw, Users, TrendingUp,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { TableToolbar } from "@/components/shared/TableToolbar";
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

interface ReportData {
  year: number;
  summary: Summary;
  monthlyTrend: MonthlyItem[];
  quarterlyBreakdown: QuarterlyItem[];
  typeBreakdown: TypeBreakdown[];
  agentBreakdown: AgentRow[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function fmt(value: number, currency = "AED"): string {
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${formatCount(value)}`;
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

function DeltaChip({ value }: { value: number }) {
  if (value > 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600"><ArrowUpRight className="h-3 w-3" />+{value}%</span>;
  if (value < 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500"><ArrowDownRight className="h-3 w-3" />{value}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminCommissionsReportPage() {
  const t = useTranslations("adminCommissionsReport");
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/commissions-report?year=${yearFilter}`);
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

  // Export config
  const exportColumns: ExportColumn<AgentRow>[] = [
    { header: t("exportHeaderAgent"), key: "agentName" },
    { header: t("exportHeaderEmail"), key: "agentEmail" },
    { header: t("exportHeaderSuperAgent"), key: "superAgentName" },
    { header: t("exportHeaderTotal"), key: "total" },
    { header: t("exportHeaderPending"), key: "pending" },
    { header: t("exportHeaderApproved"), key: "approved" },
    { header: t("exportHeaderPaid"), key: "paid" },
    { header: t("exportHeaderCommissionCount"), key: "count" },
    { header: t("exportHeaderAvgRate"), key: "avgRate" },
  ];
  const { handleExportCsv, handleExportExcel } = useTableExport({ data: filteredAgents, columns: exportColumns, filename: `commissions-report-${yearFilter}` });

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const chartData = data?.monthlyTrend.map((m) => ({
    name: MONTHS_SHORT[m.month - 1],
    Pending: m.pending,
    Approved: m.approved,
    Paid: m.paid,
  })) ?? [];

  const pieData = data?.typeBreakdown.map((t) => ({
    name: t.type.charAt(0).toUpperCase() + t.type.slice(1),
    value: t.amount,
    color: TYPE_COLORS[t.type] ?? "#94a3b8",
  })) ?? [];

  const s = data?.summary;

  return (
    <div className="page-container">
      <DashboardPageHeader
        compact
        compactOnMobile
        title={t("commissionReportTitle")}
        description={t("reportDescription", { year: yearFilter })}
        actions={(
          <>
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
          </>
        )}
        metrics={[
          { label: t("totalCommissions"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? fmt(s.totalCommissions, s.currency) : "—", icon: CircleDollarSign, iconClassName: "text-indigo-600", iconSurfaceClassName: "bg-indigo-50" },
          { label: t("pending"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? fmt(s.totalPending, s.currency) : "—", icon: Clock, iconClassName: "text-amber-600", iconSurfaceClassName: "bg-amber-50" },
          { label: t("approved"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? fmt(s.totalApproved, s.currency) : "—", icon: CheckCircle2, iconClassName: "text-blue-600", iconSurfaceClassName: "bg-blue-50" },
          { label: t("paidOut"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? fmt(s.totalPaid, s.currency) : "—", icon: Wallet, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50" },
          { label: t("avgRate"), value: loading ? <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted" /> : s ? `${s.avgRate}%` : "—", icon: TrendingUp, iconClassName: "text-violet-600", iconSurfaceClassName: "bg-violet-50" },
        ]}
      />

      {/* ── Monthly Trend Chart + Type Breakdown ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2 workspace-panel-surface rounded-3xl panel-body">
          <h2 className="heading-label mb-4 font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("monthlyTrendTitle", { year: yearFilter })}</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
              <ReTooltip formatter={(v) => fmt(v as number)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Pending" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Approved" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Paid" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="workspace-panel-surface rounded-3xl panel-body">
          <h2 className="heading-label mb-4 font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("byTypeTitle")}</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <ReTooltip formatter={(v) => fmt(v as number)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{t("noData")}</div>
          )}
          <div className="mt-2 space-y-1.5">
            {data?.typeBreakdown.map((typeItem) => {
              const typeKey = typeItem.type === "placement" ? "placementType" : typeItem.type === "override" ? "overrideType" : "bonusType";
              return (
                <div key={typeItem.type} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 capitalize">
                    <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[typeItem.type] ?? "#94a3b8" }} />
                    {t(typeKey as any)}
                  </span>
                  <span className="font-medium">{typeItem.percent}%</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Quarterly Breakdown ── */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.quarterlyBreakdown.map((q) => (
            <div key={q.label} className="workspace-glass-panel card-pad rounded-2xl">
              <p className="text-xs font-semibold text-muted-foreground">{q.label}</p>
              <p className="mt-1 text-lg font-bold">{fmt(q.total, data.summary.currency)}</p>
              <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                <span>{t("quarterlyBreakdownCommissionsLabel", { count: q.count })}</span>
              </div>
              <div className="mt-1 flex gap-1">
                <StatusBadge status="approved" />
                <span className="text-xs">{fmt(q.approved, data.summary.currency)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Agent Breakdown Table ── */}
      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="heading-label font-semibold">{t("agentBreakdownTitle")}</h2>
            {data && <Badge variant="secondary">{t("agentsCount", { count: data.agentBreakdown.length })}</Badge>}
          </div>
          <TableToolbar
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("searchPlaceholder")}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
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
                    <TableCell className="text-right font-semibold">{fmt(agent.total)}</TableCell>
                    <TableCell className="text-right text-amber-600">{fmt(agent.pending)}</TableCell>
                    <TableCell className="text-right text-indigo-600">{fmt(agent.approved)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{fmt(agent.paid)}</TableCell>
                    <TableCell className="text-right">{agent.count}</TableCell>
                    <TableCell className="text-right">{agent.avgRate ? `${Number(agent.avgRate).toFixed(1)}%` : "—"}</TableCell>
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
