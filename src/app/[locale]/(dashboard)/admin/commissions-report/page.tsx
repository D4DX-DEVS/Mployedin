"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  CalendarDays, RotateCcw, Users, TrendingUp, Sparkles,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";

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
  return `${currency} ${value.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
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
        toast.error("Failed to load commission report");
      }
    } catch {
      toast.error("Failed to load commission report");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

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
    { header: "Agent", key: "agentName" },
    { header: "Email", key: "agentEmail" },
    { header: "Super-Agent", key: "superAgentName" },
    { header: "Total (AED)", key: "total" },
    { header: "Pending (AED)", key: "pending" },
    { header: "Approved (AED)", key: "approved" },
    { header: "Paid (AED)", key: "paid" },
    { header: "Commission Count", key: "count" },
    { header: "Avg Rate (%)", key: "avgRate" },
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
    <div className="page-container space-y-6">
      {/* ── Hero Section ── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Admin workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Commission Report</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Aggregated commission analytics across all agents and super-agents — {yearFilter}. Track payouts, pending approvals, and commission types.
            </p>
          </div>
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
        </div>

        {/* KPI Cards inside hero */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Total Commissions", value: s ? fmt(s.totalCommissions, s.currency) : "—", icon: CircleDollarSign, tone: "text-indigo-600", chip: "bg-indigo-50 dark:bg-indigo-950/30" },
            { label: "Pending", value: s ? fmt(s.totalPending, s.currency) : "—", icon: Clock, tone: "text-amber-600", chip: "bg-amber-50 dark:bg-amber-950/30" },
            { label: "Approved", value: s ? fmt(s.totalApproved, s.currency) : "—", icon: CheckCircle2, tone: "text-blue-600", chip: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Paid Out", value: s ? fmt(s.totalPaid, s.currency) : "—", icon: Wallet, tone: "text-emerald-600", chip: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "Avg Rate", value: s ? `${s.avgRate}%` : "—", icon: TrendingUp, tone: "text-violet-600", chip: "bg-violet-50 dark:bg-violet-950/30" },
          ].map(({ label, value, icon: Icon, tone, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                    {loading ? <span className="h-6 w-20 animate-pulse rounded bg-muted inline-block" /> : value}
                  </p>
                </div>
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Monthly Trend Chart + Type Breakdown ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2 workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Monthly Trend ({yearFilter})</h2>
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

        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">By Type</h2>
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
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data</div>
          )}
          <div className="mt-2 space-y-1.5">
            {data?.typeBreakdown.map((t) => (
              <div key={t.type} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 capitalize">
                  <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[t.type] ?? "#94a3b8" }} />
                  {t.type}
                </span>
                <span className="font-medium">{t.percent}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Quarterly Breakdown ── */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.quarterlyBreakdown.map((q) => (
            <div key={q.label} className="workspace-glass-panel rounded-2xl p-4">
              <p className="text-xs font-semibold text-muted-foreground">{q.label}</p>
              <p className="mt-1 text-lg font-bold">{fmt(q.total, data.summary.currency)}</p>
              <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                <span>{q.count} commissions</span>
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
      <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
        <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Agent Breakdown</h2>
            {data && <Badge variant="secondary">{data.agentBreakdown.length} agents</Badge>}
          </div>
          <TableToolbar
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search agent, email, super-agent…"
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Super-Agent</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Avg Rate</TableHead>
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
                    No commission data for {yearFilter}
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
