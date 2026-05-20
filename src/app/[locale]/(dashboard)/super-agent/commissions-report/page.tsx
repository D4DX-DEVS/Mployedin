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
  ResponsiveContainer, Legend,
} from "recharts";
import {
  CircleDollarSign, Clock, CheckCircle2, Wallet,
  CalendarDays, RotateCcw, Users, Layers,
} from "lucide-react";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";

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
        toast.error("Failed to load commission report");
      }
    } catch {
      toast.error("Failed to load commission report");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

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
    { header: "Agent", key: "agentName" },
    { header: "Email", key: "agentEmail" },
    { header: "Total (AED)", key: "total" },
    { header: "Pending (AED)", key: "pending" },
    { header: "Approved (AED)", key: "approved" },
    { header: "Paid (AED)", key: "paid" },
    { header: "Count", key: "count" },
  ];
  const { handleExportCsv, handleExportExcel } = useTableExport({ data: filteredAgents, columns: exportColumns, filename: `sa-commissions-${yearFilter}` });

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const chartData = data?.monthlyTrend.map((m) => ({
    name: MONTHS_SHORT[m.month - 1],
    "My Override": m.overrideTotal,
    "Team Total": m.teamTotal,
  })) ?? [];

  const s = data?.overviewSummary;

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commission Report</h1>
          <p className="text-sm text-muted-foreground">Your override commissions and your team&apos;s earnings</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(yearFilter)} onValueChange={(v) => setYearFilter(Number(v))}>
            <SelectTrigger className="w-28">
              <CalendarDays className="mr-1.5 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchReport} disabled={loading}>
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Grand Total", value: s ? fmt(s.grandTotal, s.currency) : "—", icon: CircleDollarSign, color: "text-indigo-600 bg-indigo-50" },
          { label: "My Override", value: s ? fmt(s.overrideTotal, s.currency) : "—", icon: Layers, color: "text-violet-600 bg-violet-50" },
          { label: "Team Earned", value: s ? fmt(s.teamTotal, s.currency) : "—", icon: Users, color: "text-sky-600 bg-sky-50" },
          { label: "Pending", value: s ? fmt(s.overridePending, s.currency) : "—", icon: Clock, color: "text-amber-600 bg-amber-50" },
          { label: "Override Paid", value: s ? fmt(s.overridePaid, s.currency) : "—", icon: Wallet, color: "text-emerald-600 bg-emerald-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <span className={`rounded-full p-1.5 ${color}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-xl font-bold">
              {loading ? <span className="h-5 w-24 animate-pulse rounded bg-muted inline-block" /> : value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Monthly Trend ── */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Monthly Trend — Override vs Team ({yearFilter})</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
            <ReTooltip formatter={(v) => fmt(v as number)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="My Override" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Team Total" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Approved Breakdown ── */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Override — Pending", value: s ? fmt(s.overridePending, s.currency) : "—", icon: Clock, color: "text-amber-600" },
            { label: "Override — Approved", value: s ? fmt(s.overrideApproved, s.currency) : "—", icon: CheckCircle2, color: "text-blue-600" },
            { label: "Override — Paid", value: s ? fmt(s.overridePaid, s.currency) : "—", icon: Wallet, color: "text-emerald-600" },
            { label: "Team — Total Earned", value: s ? fmt(s.teamTotal, s.currency) : "—", icon: Users, color: "text-sky-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border bg-card p-3">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
              <p className="mt-1.5 text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Agent Breakdown Table ── */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Team Breakdown</h2>
            {data && <Badge variant="secondary">{data.agentBreakdown.length} agents</Badge>}
          </div>
          <TableToolbar
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search agent…"
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Count</TableHead>
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
                    No team commission data for {yearFilter}
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
      </div>
    </div>
  );
}
