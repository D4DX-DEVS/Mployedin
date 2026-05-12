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

interface KPIs {
  totalRequests: number;
  pending: number;
  approved: number;
  rejected: number;
  approvalRate: number;
  totalApprovedBudget: number;
  avgBudget: number;
}

interface MonthlyPoint {
  month: string;
  pending: number;
  approved: number;
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
  monthly: MonthlyPoint[];
  participation: ParticipationItem[];
  topAgents: TopAgent[];
}

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = new Date().getFullYear() - i;
  return { value: String(y), label: String(y) };
});

export default function SuperAgentExhibitionAnalyticsPage() {
  const t = useTranslations("exhibitions");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    fetch("/api/super-agent/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.profile?.currencyCode) setCurrencyCode(d.profile.currencyCode); })
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

  const { kpis, monthly, participation, topAgents } = data;
  const totalParticipation = participation.reduce((s, p) => s + p.count, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Team Exhibition Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Exhibition performance for your team's agents
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
        />
        <KPICard
          label="Approval Rate"
          value={`${kpis.approvalRate}%`}
          icon={<Percent className="h-5 w-5" />}
          sub={`${kpis.approved} approved / ${kpis.rejected} rejected`}
        />
        <KPICard
          label="Approved Budget"
          value={formatCurrency(kpis.totalApprovedBudget, currencyCode)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KPICard
          label="Avg Budget"
          value={formatCurrency(kpis.avgBudget, currencyCode)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      {/* Monthly Trend */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4">Monthly Trend</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Pending</TableHead>
                <TableHead className="text-center">Approved</TableHead>
                <TableHead className="text-center">Rejected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthly.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="font-medium">{m.month}</TableCell>
                  <TableCell className="text-center">{m.total}</TableCell>
                  <TableCell className="text-center">{m.pending || "—"}</TableCell>
                  <TableCell className="text-center">{m.approved || "—"}</TableCell>
                  <TableCell className="text-center">{m.rejected || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Participation Type */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold mb-4">By Participation Type</h2>
          <div className="space-y-3">
            {participation.map((p) => (
              <div key={p.type} className="flex items-center justify-between">
                <Badge variant="outline" className="capitalize">{p.type}</Badge>
                <div className="flex items-center gap-3">
                  <Progress
                    value={totalParticipation > 0 ? (p.count / totalParticipation) * 100 : 0}
                    className="w-24 h-2"
                  />
                  <span className="text-sm font-medium w-8 text-right">{p.count}</span>
                </div>
              </div>
            ))}
            {participation.length === 0 && (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>
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
