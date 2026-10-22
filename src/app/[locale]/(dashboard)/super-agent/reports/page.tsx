"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BarChart3, Coins, Target, TrendingDown, TrendingUp, Users2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { SuperAgentReportTabs } from "@/components/features/super-agent/SuperAgentReportTabs";
import { formatCurrency } from "@/lib/currency";
import { resolveIntlLocale } from "@/lib/ui/intlFormat";
import { AgentPerformanceTable, type AgentPerformanceRow } from "./_components/AgentPerformanceTable";
import { TeamAiReport } from "./_components/TeamAiReport";

interface MonthlyTrend {
  /** "YYYY-MM" */
  month: string;
  leads: number;
  placements: number;
  revenue: number;
  trend: number;
}

interface TeamReport {
  totalAgents: number;
  totalLeads: number;
  totalPlacements: number;
  totalCommissions: number;
  currency: string;
  otherCurrencies: { currency: string; total: number }[];
  agentBreakdown: AgentPerformanceRow[];
  monthlyTrends: MonthlyTrend[];
}

/** "2026-10" → "Oct 2026" in the reader's language. */
function monthLabel(key: string, locale: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), { month: "short", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
}

/**
 * The Team tab of the super-agent reports: every agent's numbers and the last
 * six months, for the review the dashboard is too short to hold.
 */
export default function SuperAgentReportsPage() {
  const t = useTranslations("superAgentReports");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [report, setReport] = useState<TeamReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchReports = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/super-agent/reports")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TeamReport | null) => {
        if (data) setReport(data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // The API reports money in the currency that carries most of it; the rest is
  // listed under the header instead of being added in as if it were the same.
  const currency = report?.currency ?? "AED";
  const agentRows = report?.agentBreakdown ?? [];
  const monthlyTrends = report?.monthlyTrends ?? [];
  const otherCurrencies = report?.otherCurrencies ?? [];

  const kpis = [
    { label: t("agentsManaged"), value: report?.totalAgents ?? 0, note: t("agentsManagedHelper"), icon: Users2 },
    { label: t("totalLeads"), value: report?.totalLeads ?? 0, note: t("totalLeadsHelper"), icon: Target },
    { label: t("placements"), value: report?.totalPlacements ?? 0, note: t("placementsHelper"), icon: BarChart3 },
    { label: t("commissionEarned"), value: formatCurrency(report?.totalCommissions ?? 0, currency), note: t("commissionsHelper"), icon: Coins },
  ];

  return (
    <div className="page-container">
      <SuperAgentReportTabs />
      <SuperAgentPageIntro
        title={t("teamPageTitle")}
        description={t("pageDescription")}
        // No zeros after a failed load: "0 agents" reads as an empty team.
        metrics={loading || error ? undefined : kpis}
        compactMetrics
      />

      {otherCurrencies.length > 0 ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("otherCurrencies", {
            amounts: otherCurrencies.map((row) => formatCurrency(row.total, row.currency)).join(" · "),
          })}
        </p>
      ) : null}

      {error && !loading && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{t("loadReportsError")}</p>
          <button
            type="button"
            onClick={() => fetchReports()}
            className="shrink-0 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-all"
          >
            {tc("tryAgain")}
          </button>
        </div>
      )}

      {/* Skeleton shaped like the strip the figures land in. */}
      {loading && (
        <div className="h-16 animate-pulse rounded-2xl border border-border/70 bg-card/90" />
      )}

      {!error ? (
        <>
          <SuperAgentSection
            eyebrow={t("agentComparison")}
            title={t("agentPerformanceBreakdown")}
            description={t("agentPerformanceDescription")}
          >
            {loading ? (
              <div className="space-y-2" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-xl bg-muted/50" />
                ))}
              </div>
            ) : agentRows.length === 0 ? (
              <div className="rounded-2xl border border-border/70 bg-secondary/50 text-sm leading-6 text-muted-foreground panel-body">
                {t("noAgentData")}
              </div>
            ) : (
              <AgentPerformanceTable rows={agentRows} currency={currency} />
            )}
          </SuperAgentSection>

          <SuperAgentSection
            eyebrow={t("trends")}
            title={t("monthlyTrends")}
            description={t("monthlyTrendsDescription")}
          >
            {loading ? (
              <div className="h-48 animate-pulse rounded-2xl bg-muted/50" aria-hidden="true" />
            ) : monthlyTrends.every((m) => m.leads === 0 && m.placements === 0 && m.revenue === 0) ? (
              <div className="rounded-2xl border border-border/70 bg-secondary/50 text-sm leading-6 text-muted-foreground panel-body">
                {t("noMonthlyData")}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>{t("month")}</TableHead>
                      <TableHead className="text-end">{t("newLeads")}</TableHead>
                      <TableHead className="text-end">{t("placements")}</TableHead>
                      <TableHead className="text-end">{t("commission")}</TableHead>
                      <TableHead className="hidden text-end sm:table-cell">{t("leadsChange")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyTrends.map((m) => (
                      <TableRow key={m.month} className="bg-transparent">
                        <TableCell className="whitespace-nowrap font-medium text-foreground">{monthLabel(m.month, locale)}</TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">{m.leads}</TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">{m.placements}</TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">{formatCurrency(m.revenue, currency)}</TableCell>
                        <TableCell className="hidden text-end sm:table-cell">
                          {m.trend > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600"><TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> +{m.trend}%</span>
                          ) : m.trend < 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-500"><TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> {m.trend}%</span>
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
        </>
      ) : null}

      <TeamAiReport />
    </div>
  );
}
