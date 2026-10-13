"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { AgentSectionTabs, AGENT_PERFORMANCE_TABS } from "@/components/features/agent/AgentSectionTabs";
import { ArrowRight, ArrowUpRight, ArrowDownRight, BarChart3, Briefcase, Building2, CalendarCheck2, CircleDollarSign, Download, Flame, Loader2, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { formatCount, formatTime } from "@/lib/ui/intlFormat";
import { formatCurrency } from "@/lib/currency";

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
  jobSeekers?: {
    onboarded: number;
    onboardedPremium: number;
    inArea: number;
    premiumInArea: number;
    areaAssigned: boolean;
    referred: number;
    referredLastMonth: number;
    professionTotal: number;
    professionBreakdown: Array<{ profession: string; count: number }>;
  };
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
  const locale = useLocale();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState("");
  // BUG-16: commissions must render in the agent's configured currency, not hardcoded AED.
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    fetch("/api/agent/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.settings?.currencyCode) setCurrencyCode(data.settings.currencyCode);
      })
      .catch(() => {});
  }, []);

  // A failed load used to make the KPIs, funnel and commissions vanish without
  // a word; it now says so and offers a retry.
  const [analyticsFailed, setAnalyticsFailed] = useState(false);
  const loadAnalytics = useCallback(() => {
    setAnalyticsLoading(true);
    setAnalyticsFailed(false);
    fetch("/api/agent/analytics")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => setAnalytics(data))
      .catch(() => setAnalyticsFailed(true))
      .finally(() => setAnalyticsLoading(false));
  }, []);
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

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
        // Translated copy only — the server's own message is English and raw.
        setError(t(res.status === 403 ? "aiNotAvailable" : res.status === 429 ? "aiUsageLimit" : "reportGenError"));
        return;
      }
      const data = await res.json();
      setResult({ content: data.report ?? data.content ?? JSON.stringify(data), generatedAt: formatTime(new Date()) });
    } catch {
      // Offline ("Failed to fetch") or an unreadable body: the browser's own
      // message is English and technical, so never show it.
      setError(t("reportGenError"));
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
      <WorkspaceHeader
        title={t("reportsAnalytics")}
        context={t("pageDescription")}
        metrics={analytics ? [
          { label: t("kpiLeads30d"), value: analytics.trends.leads.current.toString(), icon: Target, tone: "primary" },
          { label: t("kpiApplications30d"), value: analytics.trends.applications.current.toString(), icon: Users, tone: "info" },
          { label: t("kpiPlacements30d"), value: analytics.trends.placements.current.toString(), icon: TrendingUp, tone: "success" },
        ] : undefined}
      />

      {/* ─── KPI Cards with Trends ─── */}
      {analyticsLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="min-w-0 h-32 animate-pulse rounded-3xl border border-border/70 bg-card/90" />)}
        </div>
      ) : analyticsFailed ? (
        <ErrorState title={t("analyticsLoadFailed")} onRetry={loadAnalytics} />
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

          {/* ─── Job seekers: who the agent brought in, who is in their area, by profession ─── */}
          {analytics.jobSeekers && (() => {
            const js = analytics.jobSeekers;
            const base = `/${locale}/agent/job-seekers`;
            const tiles = [
              { key: "onboarded", label: t("seekersOnboarded"), value: js.onboarded, hint: t("seekersPremiumAmong", { count: js.onboardedPremium }), href: `${base}?onboarded=1` },
              { key: "onboardedPremium", label: t("seekersOnboardedPremium"), value: js.onboardedPremium, hint: t("seekersOnboardedPremiumHint"), href: `${base}?onboarded=1&premium=1` },
              { key: "inArea", label: t("seekersInArea"), value: js.areaAssigned ? js.inArea : "—", hint: js.areaAssigned ? t("seekersInAreaHint") : t("seekersNoRegion"), href: `${base}?view=area` },
              { key: "premiumInArea", label: t("seekersPremiumInArea"), value: js.areaAssigned ? js.premiumInArea : "—", hint: t("seekersPremiumInAreaHint"), href: `${base}?view=area&premium=1` },
              { key: "referred", label: t("seekersReferred"), value: js.referred, hint: t("seekersReferredRecent", { count: js.referredLastMonth }), href: `${base}?view=referred` },
            ];
            const max = Math.max(1, ...js.professionBreakdown.map((p) => p.count));
            const professionLabel = (p: string) =>
              p === "__other__" ? t("professionOther") : p === "__not_specified__" ? t("professionNotSpecified") : p;
            return (
              <section className="workspace-panel-surface rounded-3xl panel-body" aria-labelledby="report-seekers-heading">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h2 id="report-seekers-heading" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("seekersHeading")}</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
                  {tiles.map((tile) => (
                    <Link
                      key={tile.key}
                      href={tile.href}
                      className="min-w-0 workspace-glass-panel card-pad rounded-2xl transition-colors hover:border-primary/25 hover:bg-card"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{tile.label}</p>
                      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{tile.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
                    </Link>
                  ))}
                </div>

                <div className="mt-6 border-t border-border/30 pt-6">
                  <h3 className="heading-section font-semibold tracking-tight text-foreground">{t("seekersByProfession")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t("seekersByProfessionScope", { count: js.professionTotal })}</p>
                  {js.professionBreakdown.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">{t("seekersByProfessionEmpty")}</p>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {js.professionBreakdown.map((row) => (
                        <li key={row.profession} className="flex items-center gap-3">
                          <span className="w-36 shrink-0 truncate text-xs font-medium text-foreground/80 sm:w-56" title={professionLabel(row.profession)}>
                            {professionLabel(row.profession)}
                          </span>
                          <span className="h-4 flex-1 overflow-hidden rounded-full bg-secondary/60" aria-hidden="true">
                            <span className="block h-full rounded-full bg-primary/60" style={{ width: `${Math.max(2, Math.round((row.count / max) * 100))}%` }} />
                          </span>
                          <span className="w-10 shrink-0 text-end text-xs font-semibold tabular-nums text-foreground">{row.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })()}

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
                  <p className="mt-1 text-xs text-muted-foreground">{formatCurrency((c.data?.total ?? 0), currencyCode)}</p>
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
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
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
          aria-label={t("customReport")}
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
