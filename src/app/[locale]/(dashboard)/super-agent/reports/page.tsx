"use client";

import { useState, useEffect } from "react";
import { BarChart3, Coins, Target, TrendingDown, TrendingUp, Users2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { formatCurrency } from "@/lib/currency";

interface Stats {
  totalAgents: number;
  totalLeads: number;
  totalPlacements: number;
  totalCommissions: number;
}

interface AgentBreakdown {
  name: string;
  leads: number;
  placements: number;
  conversionRate: number;
  commission: number;
}

interface MonthlyTrend {
  month: string;
  leads: number;
  placements: number;
  revenue: number;
  trend: number;
}

export default function SuperAgentReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState("AED");
  const [agentBreakdown, setAgentBreakdown] = useState<AgentBreakdown[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);

  useEffect(() => {
    fetch("/api/super-agent/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.currencyCode) setCurrencyCode(data.settings.currencyCode);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/super-agent/reports")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setStats(data);
          if (data.agentBreakdown) setAgentBreakdown(data.agentBreakdown);
          if (data.monthlyTrends) setMonthlyTrends(data.monthlyTrends);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = [
    {
      label: "Agents Managed",
      value: stats?.totalAgents ?? 0,
      helper: "Total team members currently falling under your direct reporting view.",
      icon: <Users2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Total Leads",
      value: stats?.totalLeads ?? 0,
      helper: "Combined lead volume generated and worked by your team.",
      icon: <Target className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
    {
      label: "Placements",
      value: stats?.totalPlacements ?? 0,
      helper: "Successful placements recorded across the current reporting scope.",
      icon: <BarChart3 className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Commissions",
      value: formatCurrency(stats?.totalCommissions ?? 0, currencyCode),
      helper: "Total commissions currently included in the super-agent report payload.",
      icon: <Coins className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Reports"
        description="Use the report summary as your regional scorecard for team coverage, lead volume, placements, and commission output."
        summaryTitle="Reporting surface"
        summaryDescription="The page still consumes the same `/api/super-agent/reports` payload and only changes the presentation layer."
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-[24px] border border-border/70 bg-card/90 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.18)]" />
          ))}
        </div>
      ) : (
        <SuperAgentMetricsGrid items={kpis} />
      )}

      {/* Agent Comparison */}
      <SuperAgentSection
        eyebrow="Agent comparison"
        title="Agent Performance Breakdown"
        description="Compare individual agent performance metrics across your team."
      >
        {agentBreakdown.length === 0 ? (
          <div className="rounded-2xl border border-border/70 bg-secondary/50 p-5 text-sm leading-6 text-muted-foreground">
            Agent comparison data will appear once agents generate activity.
          </div>
        ) : (
          <div className="space-y-3">
            {agentBreakdown.map((agent) => (
              <div key={agent.name} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.leads} leads · {agent.placements} placements</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Conversion</p>
                      <p className={`text-sm font-semibold ${agent.conversionRate >= 30 ? "text-emerald-600" : agent.conversionRate >= 15 ? "text-amber-600" : "text-red-500"}`}>
                        {agent.conversionRate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Commission</p>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(agent.commission, currencyCode)}</p>
                    </div>
                  </div>
                </div>
                {/* Performance bar */}
                <div className="mt-3 flex gap-1">
                  <div className="h-2 rounded-full bg-sky-400" style={{ width: `${Math.min(100, agent.leads * 2)}%` }} title="Leads" />
                  <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, agent.placements * 5)}%` }} title="Placements" />
                  <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.min(100, agent.conversionRate)}%` }} title="Conversion" />
                </div>
              </div>
            ))}
          </div>
        )}
      </SuperAgentSection>

      {/* Monthly Trends */}
      <SuperAgentSection
        eyebrow="Trends"
        title="Monthly Trends"
        description="Track key metrics month over month to spot patterns and seasonality."
      >
        {monthlyTrends.length === 0 ? (
          <div className="rounded-2xl border border-border/70 bg-secondary/50 p-5 text-sm leading-6 text-muted-foreground">
            Monthly trends will appear after the first full month of data.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Placements</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyTrends.map((m) => (
                  <TableRow key={m.month} className="bg-transparent">
                    <TableCell className="font-medium text-foreground">{m.month}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.leads}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.placements}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(m.revenue, currencyCode)}</TableCell>
                    <TableCell className="text-right">
                      {m.trend > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600"><TrendingUp className="h-3.5 w-3.5" /> +{m.trend}%</span>
                      ) : m.trend < 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-500"><TrendingDown className="h-3.5 w-3.5" /> {m.trend}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SuperAgentSection>
    </div>
  );
}
