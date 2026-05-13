"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarDays, CheckCircle2, Clock, TrendingUp, XCircle,
  BarChart3, Percent, DollarSign, Users,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCurrency } from "@/lib/currency";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

interface KPIs {
  totalRequests: number;
  submitted: number;
  approved: number;
  rejected: number;
  completed: number;
  underReview: number;
  approvalRate: number;
  totalEstimatedBudget: number;
  totalApprovedBudget: number;
  totalActualSpend: number;
  avgBudget: number;
  budgetVariance: number;
}

interface Performance {
  totalLeads: number;
  totalEmployers: number;
  totalCandidates: number;
  totalHires: number;
  totalRevenue: number;
  totalCost: number;
  roi: number;
  eventsReported: number;
}

interface MonthlyPoint {
  month: string;
  submitted: number;
  under_review: number;
  approved: number;
  completed: number;
  rejected: number;
  total: number;
}

interface ParticipationItem {
  type: string;
  count: number;
}

interface TopAgent {
  agentId: string;
  name: string;
  total: number;
  approved: number;
  approvalRate: number;
  totalBudget: number;
}

interface AnalyticsData {
  year: number;
  kpis: KPIs;
  performance: Performance;
  monthly: MonthlyPoint[];
  participation: ParticipationItem[];
  topAgents: TopAgent[];
}

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = new Date().getFullYear() - i;
  return { value: String(y), label: String(y) };
});

export default function AdminExhibitionAnalyticsPage() {
  const t = useTranslations("exhibitions");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.settings?.defaultCurrency) setCurrencyCode(d.settings.defaultCurrency); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/exhibitions/analytics?year=${year}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Clock className="h-5 w-5 animate-spin mr-2" /> Loading analytics...
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-muted-foreground">Failed to load analytics.</div>;
  }

  const { kpis, performance, monthly, participation, topAgents } = data;
  const totalParticipation = participation.reduce((s, p) => s + p.count, 0);
  const perf = performance ?? {} as Performance;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Exhibition Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Performance metrics and trends for exhibition requests
          </p>
        </div>
        <SearchableSelect
          options={YEAR_OPTIONS}
          value={year}
          onValueChange={setYear}
          placeholder="Select year"
        />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Total Requests"
          value={kpis.totalRequests}
          icon={<CalendarDays className="h-5 w-5" />}
          sub={`${kpis.completed ?? 0} completed`}
        />
        <KPICard
          label="Approval Rate"
          value={`${kpis.approvalRate}%`}
          icon={<Percent className="h-5 w-5" />}
          sub={`${kpis.approved} approved / ${kpis.rejected} rejected`}
        />
        <KPICard
          label="Total Approved Budget"
          value={formatCurrency(kpis.totalApprovedBudget, currencyCode)}
          icon={<DollarSign className="h-5 w-5" />}
          sub={`Estimated: ${formatCurrency(kpis.totalEstimatedBudget ?? 0, currencyCode)}`}
        />
        <KPICard
          label="Actual Spend"
          value={formatCurrency(kpis.totalActualSpend ?? 0, currencyCode)}
          icon={<TrendingUp className="h-5 w-5" />}
          sub={`Variance: ${formatCurrency(kpis.budgetVariance ?? 0, currencyCode)}`}
        />
      </div>

      {/* Performance KPIs */}
      {perf.eventsReported > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard label="Leads Generated" value={perf.totalLeads} icon={<Users className="h-5 w-5" />} />
          <KPICard label="Hires" value={perf.totalHires} icon={<CheckCircle2 className="h-5 w-5" />} sub={`from ${perf.eventsReported} events`} />
          <KPICard label="Revenue" value={formatCurrency(perf.totalRevenue, currencyCode)} icon={<DollarSign className="h-5 w-5" />} />
          <KPICard label="ROI" value={`${perf.roi?.toFixed(1) ?? 0}%`} icon={<TrendingUp className="h-5 w-5" />} sub={`Cost: ${formatCurrency(perf.totalCost, currencyCode)}`} />
        </div>
      )}

      {/* Status Breakdown */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4">Status Breakdown</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatusBar label="Submitted" count={kpis.submitted} total={kpis.totalRequests} color="bg-blue-500" />
          <StatusBar label="Under Review" count={kpis.underReview ?? 0} total={kpis.totalRequests} color="bg-amber-500" />
          <StatusBar label="Approved" count={kpis.approved} total={kpis.totalRequests} color="bg-emerald-500" />
          <StatusBar label="Completed" count={kpis.completed ?? 0} total={kpis.totalRequests} color="bg-teal-500" />
          <StatusBar label="Rejected" count={kpis.rejected} total={kpis.totalRequests} color="bg-red-500" />
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4">Monthly Trend</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="submitted" fill="#3b82f6" name="Submitted" radius={[2, 2, 0, 0]} />
              <Bar dataKey="approved" fill="#10b981" name="Approved" radius={[2, 2, 0, 0]} />
              <Bar dataKey="completed" fill="#14b8a6" name="Completed" radius={[2, 2, 0, 0]} />
              <Bar dataKey="rejected" fill="#ef4444" name="Rejected" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Participation Type Pie */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold mb-4">By Participation Type</h2>
          {participation.length > 0 ? (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={participation.map((p) => ({ name: p.type, value: p.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e) => e.name}>
                      {participation.map((_, i) => (<Cell key={i} fill={["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#14b8a6","#ec4899","#6366f1"][i % 8]} />))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-3">
                {participation.map((p) => (
                  <div key={p.type} className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize">{p.type}</Badge>
                    <div className="flex items-center gap-3">
                      <Progress value={totalParticipation > 0 ? (p.count / totalParticipation) * 100 : 0} className="w-24 h-2" />
                      <span className="text-sm font-medium w-8 text-right">{p.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (<p className="text-sm text-muted-foreground">No data</p>)}
        </div>

        {/* Top Agents */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5" /> Top Exhibitors
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-center">Requests</TableHead>
                <TableHead className="text-center">Approved</TableHead>
                <TableHead className="text-right">Budget</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topAgents.map((agent) => (
                <TableRow key={agent.agentId}>
                  <TableCell className="font-medium">{agent.name}</TableCell>
                  <TableCell className="text-center">{agent.total}</TableCell>
                  <TableCell className="text-center">
                    {agent.approved} ({agent.approvalRate}%)
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(agent.totalBudget, currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
              {topAgents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    No exhibition data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, icon, sub }: { label: string; value: string | number; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div>
      </div>
    </div>
  );
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
