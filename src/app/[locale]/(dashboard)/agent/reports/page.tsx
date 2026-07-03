"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ArrowUpRight, ArrowDownRight, BarChart3, Briefcase, Building2, CalendarCheck2, CircleDollarSign, Download, Flame, Loader2, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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
  if (trend.direction === "down") return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500"><ArrowDownRight className="h-3 w-3" />{trend.delta}%</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

const FUNNEL_STAGES = ["new", "contacted", "interested", "negotiating", "converted", "lost"] as const;
const FUNNEL_COLORS: Record<string, string> = { new: "bg-sky-400", contacted: "bg-indigo-400", interested: "bg-violet-400", negotiating: "bg-amber-400", converted: "bg-emerald-400", lost: "bg-rose-400" };

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
      setResult({ content: data.report ?? data.content ?? JSON.stringify(data), generatedAt: new Date().toLocaleTimeString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
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
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Sparkles className="h-3.5 w-3.5" />{t("agentWorkspace")}</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{t("reportsAnalytics")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t("pageDescription")}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("analytics")}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{analytics?.kpis.totalLeads ?? "—"} {t("leadsTotal")}</p>
            <p className="text-xs text-muted-foreground">{t("liveDataDesc")}</p>
          </div>
        </div>
      </section>

      {/* ─── KPI Cards with Trends ─── */}
      {analyticsLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-[24px] border border-border/70 bg-card/90" />)}
        </div>
      ) : analytics && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: t("kpiLeads30d"), value: analytics.trends.leads.current, trend: analytics.trends.leads, icon: <Target className="h-5 w-5" />, tone: "workspace-tone-sky" },
              { label: t("kpiApplications30d"), value: analytics.trends.applications.current, trend: analytics.trends.applications, icon: <Users className="h-5 w-5" />, tone: "workspace-tone-indigo" },
              { label: t("kpiPlacements30d"), value: analytics.trends.placements.current, trend: analytics.trends.placements, icon: <TrendingUp className="h-5 w-5" />, tone: "workspace-tone-emerald" },
              { label: t("kpiInterviews30d"), value: analytics.trends.interviews.current, trend: analytics.trends.interviews, icon: <CalendarCheck2 className="h-5 w-5" />, tone: "workspace-tone-amber" },
            ].map((kpi) => (
              <div key={kpi.label} className="workspace-glass-panel rounded-[24px] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{kpi.label}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{kpi.value}</p>
                    <div className="mt-1"><TrendBadge trend={kpi.trend} /></div>
                  </div>
                  <div className={`${kpi.tone} rounded-2xl p-2.5`}>{kpi.icon}</div>
                </div>
              </div>
            ))}
          </section>

          {/* ─── Quick Stats Row ─── */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: t("activeJobs"), value: analytics.kpis.activeJobs, icon: <Briefcase className="h-4 w-4" /> },
              { label: t("employers"), value: analytics.kpis.employers, icon: <Building2 className="h-4 w-4" /> },
              { label: t("overdueFollowups"), value: analytics.kpis.overdueFollowUps, icon: <Flame className="h-4 w-4" />, alert: analytics.kpis.overdueFollowUps > 0 },
              { label: t("scheduledInterviews"), value: analytics.kpis.scheduledInterviews, icon: <CalendarCheck2 className="h-4 w-4" /> },
            ].map((s) => (
              <div key={s.label} className={`workspace-glass-panel rounded-2xl p-4 ${s.alert ? "border-amber-200 dark:border-amber-800/40" : ""}`}>
                <div className="flex items-center gap-2 text-muted-foreground">{s.icon}<p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{s.label}</p></div>
                <p className={`mt-2 text-2xl font-semibold ${s.alert ? "text-amber-600" : "text-foreground"}`}>{s.value}</p>
              </div>
            ))}
          </section>

          {/* ─── Lead Funnel ─── */}
          <section className="workspace-panel-surface rounded-[28px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("leadFunnel")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("pipelineStageDistribution")}</h2>
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
          <section className="workspace-panel-surface rounded-[28px] p-5">
            <div className="flex items-center gap-2 mb-4">
              <CircleDollarSign className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("commissionSummary")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: t("commissionPending"), data: analytics.commissions.pending, color: "text-amber-600" },
                { label: t("commissionApproved"), data: analytics.commissions.approved, color: "text-sky-600" },
                { label: t("commissionPaid"), data: analytics.commissions.paid, color: "text-emerald-600" },
              ].map((c) => (
                <div key={c.label} className="workspace-glass-panel rounded-2xl p-4 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{c.label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${c.color}`}>{c.data?.count ?? 0}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{(c.data?.total ?? 0).toLocaleString()} AED</p>
                </div>
              ))}
            </div>
          </section>

          {/* ─── Monthly Trends Table ─── */}
          {analytics.monthlyTrends.length > 0 && (
            <section className="workspace-panel-surface rounded-[28px] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("monthlyTrends")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("sixMonthPerformance")}</h2>
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
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 text-xs font-semibold"><ArrowUpRight className="h-3 w-3" />+{m.trend}%</span>
                          ) : m.trend < 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-red-500 text-xs font-semibold"><ArrowDownRight className="h-3 w-3" />{m.trend}%</span>
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
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("aiPoweredReports")}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("generateCustomReports")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("reportsFromLiveData")}</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REPORT_TEMPLATES.map((template) => (
            <button
              key={template.labelKey}
              onClick={() => { setQuery(template.query); generateReport(template.query); }}
              disabled={loading}
              className="workspace-subtle-surface rounded-2xl p-4 text-left text-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)] disabled:opacity-50"
            >
              <BarChart3 className="mb-2 h-4 w-4 text-primary" />
              <div className="font-semibold text-foreground">{t(template.labelKey)}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{template.query}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace-panel-surface space-y-4 rounded-[28px] p-5 sm:p-6">
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
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? t("generating") : t("generateReport")}
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <section className="workspace-panel-surface space-y-4 rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">{t("reportGeneratedAt", { time: result.generatedAt })}</p>
            <button
              onClick={downloadReport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" />
              {tc("export")}
            </button>
          </div>
          <div className="workspace-subtle-surface rounded-2xl p-4">
            <MarkdownRenderer content={result.content} />
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"><ArrowRight className="h-3.5 w-3.5 text-primary" />{t("exportForHandoff")}</div>
        </section>
      )}
    </div>
  );
}
