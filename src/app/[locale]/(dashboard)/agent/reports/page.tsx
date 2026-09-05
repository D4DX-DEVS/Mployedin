"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AgentSectionTabs, AGENT_PERFORMANCE_TABS } from "@/components/features/agent/AgentSectionTabs";
import { ArrowRight, ArrowUpRight, ArrowDownRight, BarChart3, Briefcase, Building2, CalendarCheck2, CircleDollarSign, Download, Flame, Loader2, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { formatCount, formatTime } from "@/lib/ui/intlFormat";

/* ─── AI Report Templates ─── */

const REPORT_TEMPLATES = [
  { labelKey: "weekActivitySummary", query: "Summarize my leads activity and conversions for this week" },
  { labelKey: "topConversionOpp", query: "Which of my leads have the highest conversion potential and why?" },
  { labelKey: "followUpPriorityList", query: "Which leads need follow up today based on last contact date and stage?" },
  { labelKey: "monthlyPerfOverview", query: "Give me a full performance overview for last month including leads, placements, and commissions" },
];

/* ─── Types ─── */

interface TrendData { current: number; previous: number; delta: number; direction: string }

interface Analytics {
  kpis: {
    totalLeads: number; totalPlacements: number; totalApplications: number;
    activeJobs: number; totalOffers: number; scheduledInterviews: number;
    employers: number; overdueFollowUps: number;
  };
  trends: { leads: TrendData; placements: TrendData; applications: TrendData; interviews: TrendData };
  leadFunnel: Record<string, number>;
  applicationBreakdown: Record<string, number>;
  commissions: Record<string, { total: number; count: number }>;
  monthlyTrends: { month: string; leads: number; placements: number; applications: number; trend: number }[];
  commissionRate: number;
}

interface ReportResult { content: string; generatedAt: string }

/* ─── Helpers ─── */

function TrendBadge({ trend }: { trend: TrendData }) {
  if (trend.direction === "up") return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600"><ArrowUpRight className="h-3 w-3" />+{trend.delta}%</span>;
  if (trend.direction === "down") return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600"><ArrowDownRight className="h-3 w-3" />{trend.delta}%</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

const FUNNEL_STAGES = ["new", "contacted", "interested", "negotiating", "converted", "lost"] as const;
const FUNNEL_COLORS: Record<string, string> = { new: "bg-blue-500/60", contacted: "bg-blue-600/60", interested: "bg-amber-500/60", negotiating: "bg-violet-500/60", converted: "bg-emerald-500/60", lost: "bg-muted-foreground/40" };

export default function AgentReportsPage() {
  const t = useTranslations("agentReports");
  const tc = useTranslations("common");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/agent/analytics")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setAnalytics(data); })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, []);

  const generateReport = async (reportQuery?: string) => {
    const q = reportQuery ?? query;
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, scope: "platform" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 403) {
          throw new Error(t("aiNotAvailable"));
        }
        if (res.status === 429) {
          throw new Error(t("aiUsageLimit"));
        }
        throw new Error(data?.message || data?.error || t("reportGenError"));
      }
      const data = await res.json();
      setResult({ content: data.report ?? data.content ?? JSON.stringify(data), generatedAt: formatTime(new Date()) });
    } catch (e) {
      setError("We couldn't generate this report. No report was saved. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const blob = new Blob([result.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-report-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalFunnel = analytics ? Object.values(analytics.leadFunnel).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="page-container">
      <AgentSectionTabs tabs={AGENT_PERFORMANCE_TABS} ariaLabelKey="performanceTabsLabel" />
      <DashboardPageHeader
        icon={BarChart3}
        title={t("reportsAnalytics")}
        description={t("pageDescription")}
        metrics={analytics ? [
          { label: t("kpiLeads30d"), value: analytics.trends.leads.current.toString(), icon: Target },
          { label: t("kpiApplications30d"), value: analytics.trends.applications.current.toString(), icon: Users },
          { label: t("kpiPlacements30d"), value: analytics.trends.placements.current.toString(), icon: TrendingUp },
        ] : undefined}
        compactMetrics
      />

      {/* ─── KPI Cards with Trends ─── */}
      {analyticsLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="min-w-0 h-32 animate-pulse rounded-3xl border border-border/70 bg-card/90" />)}
        </div>
      ) : analytics && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {[
              { label: t("activeJobs"), value: analytics.kpis.activeJobs, icon: <Briefcase className="h-4 w-4" /> },
              { label: t("employers"), value: analytics.kpis.employers, icon: <Building2 className="h-4 w-4" /> },
              { label: t("overdueFollowups"), value: analytics.kpis.overdueFollowUps, icon: <Flame className="h-4 w-4" />, alert: analytics.kpis.overdueFollowUps > 0 },
              { label: t("scheduledInterviews"), value: analytics.kpis.scheduledInterviews, icon: <CalendarCheck2 className="h-4 w-4" /> },
            ].map((s) => (
              <div key={s.label} className={`min-w-0 workspace-glass-panel card-pad rounded-2xl ${s.alert ? "border-amber-500/30" : ""}`}>
                <div className="flex items-center gap-2 text-muted-foreground">{s.icon}<p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{s.label}</p></div>
                <p className={`mt-2 text-xl sm:text-2xl font-semibold ${s.alert ? "text-amber-600" : "text-foreground"}`}>{s.value}</p>
              </div>
            ))}
          </section>

          {/* ─── Lead Funnel ─── */}
          <section className="workspace-panel-surface rounded-3xl panel-body">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("leadFunnel")}</p>
            <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{t("pipelineStageDistribution")}</h2>
            <div className="mt-5 space-y-3">
              {FUNNEL_STAGES.map((stage) => {
                const count = analytics.leadFunnel[stage] ?? 0;
                const pct = totalFunnel > 0 ? Math.round((count / totalFunnel) * 100) : 0;
                const stageLabels: Record<string, string> = {
                  new: t("stageNew"),
                  contacted: t("stageContacted"),
                  interested: t("stageInterested"),
                  negotiating: t("stageNegotiating"),
                  converted: t("stageConverted"),
                  lost: t("stageLost"),
                };
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-medium capitalize text-muted-foreground">{stageLabels[stage]}</span>
                    <div className="flex-1 h-6 rounded-full bg-secondary/60 overflow-hidden">
                      <div className={`h-full rounded-full ${FUNNEL_COLORS[stage]}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="w-14 text-right text-xs font-semibold text-foreground">{count} <span className="text-muted-foreground">({pct}%)</span></span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ─── Commission Summary ─── */}
          <section className="workspace-panel-surface rounded-3xl panel-body">
            <div className="flex items-center gap-2 mb-4">
              <CircleDollarSign className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("commissionSummary")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3">
              {[
                { label: t("commissionPending"), data: analytics.commissions.pending, color: "text-status-shortlisted" },
                { label: t("commissionApproved"), data: analytics.commissions.approved, color: "text-status-applied" },
                { label: t("commissionPaid"), data: analytics.commissions.paid, color: "text-status-selected" },
              ].map((c) => (
                <div key={c.label} className="min-w-0 workspace-glass-panel card-pad rounded-2xl text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{c.label}</p>
                  <p className={`mt-2 text-xl sm:text-2xl font-semibold ${c.color}`}>{c.data?.count ?? 0}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatCount((c.data?.total ?? 0))} AED</p>
                </div>
              ))}
            </div>
          </section>

          {/* ─── Monthly Trends Table ─── */}
          {analytics.monthlyTrends.length > 0 && (
            <section className="workspace-panel-surface rounded-3xl panel-body">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("monthlyTrends")}</p>
              <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{t("sixMonthPerformance")}</h2>
              <div className="mt-5 overflow-x-auto rounded-3xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-background/60 hover:bg-background/60">
                      <TableHead>{t("month")}</TableHead>
                      <TableHead className="text-right">{t("leads")}</TableHead>
                      <TableHead className="text-right">{t("applications")}</TableHead>
                      <TableHead className="text-right">{t("placements")}</TableHead>
                      <TableHead className="text-right">{t("trend")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.monthlyTrends.map((m) => (
                      <TableRow key={m.month} className="bg-transparent">
                        <TableCell className="font-medium text-foreground">{m.month}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.leads}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.applications}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.placements}</TableCell>
                        <TableCell className="text-right">
                          {m.trend > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-status-selected text-xs font-semibold"><ArrowUpRight className="h-3 w-3" />+{m.trend}%</span>
                          ) : m.trend < 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-status-rejected text-xs font-semibold"><ArrowDownRight className="h-3 w-3" />{m.trend}%</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </>
      )}

      {/* ─── AI Report Section ─── */}
      <section className="workspace-panel-surface rounded-3xl panel-body">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("aiPoweredReports")}</p>
        <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{t("generateCustomReports")}</h2>
        <p className="mt-1 text-sm text-muted-foreground max-sm:hidden">{t("reportsFromLiveData")}</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REPORT_TEMPLATES.map((template) => (
            <button
              key={template.labelKey}
              onClick={() => { setQuery(template.query); generateReport(template.query); }}
              disabled={loading}
              className="min-w-0 workspace-subtle-surface card-pad rounded-2xl text-left text-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)] disabled:opacity-50"
            >
              <BarChart3 className="mb-2 h-4 w-4 text-primary" />
              <div className="font-semibold text-foreground">{t(template.labelKey)}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{template.query}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace-panel-surface space-y-4 rounded-3xl panel-body">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">{t("customReport")}</p>
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder={t("customReportPlaceholder")}
          className="w-full rounded-2xl border border-border bg-secondary/65 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
        />
        <button
          onClick={() => generateReport()}
          disabled={!query.trim() || loading}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? t("generating") : t("generateReport")}
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 text-sm text-destructive chip-pad">
          {error}
        </div>
      )}

      {result && (
        <section className="workspace-panel-surface space-y-4 rounded-3xl panel-body">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">{t("reportGeneratedAt", { time: result.generatedAt })}</p>
            <button
              onClick={downloadReport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary chip-pad"
            >
              <Download className="h-3.5 w-3.5" />
              {tc("export")}
            </button>
          </div>
          <div className="workspace-subtle-surface card-pad rounded-2xl">
            <MarkdownRenderer content={result.content} />
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"><ArrowRight className="h-3.5 w-3.5 text-primary" />{t("exportForHandoff")}</div>
        </section>
      )}
    </div>
  );
}
