"use client";

import { useState, useEffect } from "react";
import { BarChart3, Coins, Download, Loader2, Sparkles, Target, TrendingDown, TrendingUp, Users2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { formatCurrency } from "@/lib/currency";

const SA_REPORT_TEMPLATES = [
  { label: "Team performance summary", query: "Summarize overall team performance this month: total leads, placements, commissions, and highlight top performers" },
  { label: "Agent comparison analysis", query: "Compare all my agents side by side on leads generated, placement rate, and commission earned. Who needs coaching?" },
  { label: "Lead pipeline health", query: "Analyze the health of my team's lead pipeline: conversion rates by stage, stale leads, and bottlenecks" },
  { label: "Commission forecast", query: "Project next month's commissions based on current pipeline and historical conversion rates" },
];

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

  /* AI Report state */
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ content: string; generatedAt: string } | null>(null);
  const [aiError, setAiError] = useState("");

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

  const generateAIReport = async (reportQuery?: string) => {
    const q = reportQuery ?? aiQuery;
    if (!q.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiResult(null);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, scope: "platform" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAiResult({ content: data.report ?? data.content ?? JSON.stringify(data), generatedAt: new Date().toLocaleTimeString() });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setAiLoading(false);
    }
  };

  const downloadAIReport = () => {
    if (!aiResult) return;
    const blob = new Blob([aiResult.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sa-report-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        summaryDescription="A consolidated view of your team's coverage, pipeline, and commission performance — updated in real time."
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

      {/* ─── AI Report Section ─── */}
      <SuperAgentSection
        eyebrow="AI-powered reports"
        title="Generate Custom Reports"
        description="Reports are generated using your actual database figures — leads, placements, commissions, and agent data."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SA_REPORT_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => { setAiQuery(t.query); generateAIReport(t.query); }}
              disabled={aiLoading}
              className="workspace-subtle-surface rounded-2xl p-4 text-left text-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)] disabled:opacity-50"
            >
              <BarChart3 className="mb-2 h-4 w-4 text-primary" />
              <div className="font-semibold text-foreground">{t.label}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{t.query}</div>
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Custom report</p>
          </div>
          <textarea
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            rows={3}
            placeholder="e.g. Which agents have the best lead-to-placement conversion rate this quarter?"
            className="w-full rounded-2xl border border-border bg-secondary/65 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
          />
          <button
            onClick={() => generateAIReport()}
            disabled={!aiQuery.trim() || aiLoading}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? "Generating…" : "Generate Report"}
          </button>
        </div>

        {aiError && (
          <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{aiError}</div>
        )}

        {aiResult && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">Report Generated at {aiResult.generatedAt}</p>
              <button
                onClick={downloadAIReport}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary"
              >
                <Download className="h-3.5 w-3.5" />Export
              </button>
            </div>
            <div className="workspace-subtle-surface rounded-2xl p-4">
              <MarkdownRenderer content={aiResult.content} />
            </div>
          </div>
        )}
      </SuperAgentSection>
    </div>
  );
}
