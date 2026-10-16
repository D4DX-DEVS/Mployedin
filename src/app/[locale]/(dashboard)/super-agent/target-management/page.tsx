"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { PaginationControls } from "@/components/shared/PaginationControls";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CompactProgress, RiskBadge, PerformanceBadge,
  MonthlyDistributionGrid, TargetEmptyState,
  TargetSummaryCard, CompletionBadge,
  CompletionStage, getCompletionStage, IncentiveTierBadge, ProgressRing,
} from "@/components/features/targets/TargetComponents";
import { TeamAllocationDialog } from "@/components/features/targets/TeamAllocationDialog";
import { AgentDetailDialog, type AgentDetailProfile } from "@/components/features/targets/AgentDetailDialog";
import { TargetYearSelect, defaultTargetYears } from "@/components/features/targets/TargetYearSelect";
import { formatProfit } from "@/components/features/targets/profitFormat";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SplitSquareVertical, TrendingUp, RotateCcw, Download,
  Search, AlertCircle, CheckCircle2, ClipboardList, MapPin, Mail,
  Eye, SlidersHorizontal, CircleDollarSign, Users, Wallet, FileText, Pencil,
} from "lucide-react";
import { formatDate } from "@/lib/ui/intlFormat";
import { RowActions } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import type { EnrichedProfile as EngineProfile } from "@/lib/targets/profileAchievementCalculator";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A team row: the engine's enriched profile plus the agent's name and territory. */
type TeamProfile = AgentDetailProfile;

interface TeamTotals {
  agents: number;
  /** Super agents' agents are funded in one currency, so this is a plain pair. */
  profit: { currency: string | null; target: number; achieved: number; others: { currency: string }[] };
  avgProgress: number;
  riskBreakdown: { high: number; medium: number; low: number };
}

interface TeamOverview {
  stageCounts: Record<CompletionStage, number>;
  territories: string[];
  currencyLabel: string;
  currencyCount: number;
  attention: { behindProfit: number; highRisk: number };
  topPerformers: TeamProfile[];
  underPerformers: TeamProfile[];
  pendingActions: number;
  deadlineAlerts: TeamProfile[];
}

interface Analytics {
  teamSummary: {
    totalAgents: number;
    avgProgress: number;
    highRiskCount: number;
    onTrackCount: number;
    incentiveBreakdown: { bronze: number; silver: number; gold: number; platinum: number };
  };
  agentRankings: {
    rank: number;
    _id: string;
    assigneeName: string;
    currency: string;
    profitTarget: number;
    profitAchieved: number;
    profitProgress: number;
    riskScore: "high" | "medium" | "low";
    incentiveTier: "none" | "bronze" | "silver" | "gold" | "platinum";
  }[];
  monthlyTeamTrend: { month: number; profitTarget: number; profitAchieved: number }[];
}

type MetricTone = "blue" | "green" | "violet" | "amber" | "red";

const METRIC_TONE_CLASS_MAP: Record<MetricTone, string> = {
  blue: "workspace-tone-sky",
  green: "workspace-tone-emerald",
  violet: "workspace-tone-violet",
  amber: "workspace-tone-amber",
  red: "workspace-tone-rose",
};

const pct = (achieved: number, target: number) => (target > 0 ? Math.min(Math.round((achieved / target) * 100), 999) : 0);

function getProgressColor(progress: number): string {
  if (progress >= 75) return "bg-emerald-500";
  if (progress >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function getProgressTextColor(progress: number): string {
  if (progress >= 75) return "text-emerald-600";
  if (progress >= 40) return "text-amber-600";
  return "text-red-500";
}

function DashboardMetricCard({ label, value, helper, icon, progress, tone = "blue" }: {
  label: string;
  value: ReactNode;
  helper: string;
  icon: ReactNode;
  progress?: number;
  tone?: MetricTone;
}) {
  return (
    // Tighter than `card-pad`: these sit in one row above the agent table, and
    // at the shared card rhythm the strip alone pushed the table off the first
    // screen. Phones show label + value + slim progress only.
    <div className="workspace-glass-panel rounded-xl p-2.5 sm:p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-[11px]">{label}</p>
          <div className="mt-0.5 text-base font-semibold leading-tight tracking-tight text-foreground sm:mt-1 sm:text-lg">{value}</div>
          <p className="mt-0.5 hidden text-[11px] leading-4 text-muted-foreground sm:block">{helper}</p>
        </div>
        <div className={`${METRIC_TONE_CLASS_MAP[tone]} hidden shrink-0 rounded-lg p-1.5 sm:block`}>{icon}</div>
      </div>
      {typeof progress === "number" ? (
        <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
            <div className={`h-full rounded-full ${getProgressColor(progress)}`} style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          <span className={`min-w-9 text-end text-[11px] font-bold tabular-nums ${getProgressTextColor(progress)} max-sm:hidden`}>{progress}%</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentTargetProfilesPage() {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const requestedYear = Number.parseInt(searchParams.get("year") ?? "", 10);
  const initialYearFilter = Number.isFinite(requestedYear) && requestedYear > 0 ? requestedYear : currentYear;

  const [yearFilter, setYearFilter] = useState(initialYearFilter);
  const [tab, setTab] = useState<"own" | "team" | "analytics">("team");
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);

  // Own profile
  const [ownProfile, setOwnProfile] = useState<EngineProfile | null>(null);

  // Team
  const [teamProfiles, setTeamProfiles] = useState<TeamProfile[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [teamTotalPages, setTeamTotalPages] = useState(1);
  const [teamTotals, setTeamTotals] = useState<TeamTotals>({
    agents: 0,
    profit: { currency: null, target: 0, achieved: 0, others: [] },
    avgProgress: 0,
    riskBreakdown: { high: 0, medium: 0, low: 0 },
  });
  const [teamOverview, setTeamOverview] = useState<TeamOverview>({
    stageCounts: { not_started: 0, in_progress: 0, completed: 0 },
    territories: [],
    currencyLabel: "AED",
    currencyCount: 1,
    attention: { behindProfit: 0, highRisk: 0 },
    topPerformers: [],
    underPerformers: [],
    pendingActions: 0,
    deadlineAlerts: [],
  });
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamRiskFilter, setTeamRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [teamCompletionFilter, setTeamCompletionFilter] = useState<"all" | CompletionStage>("all");
  const [teamTerritoryFilter, setTeamTerritoryFilter] = useState("all");

  // Distribute dialog
  const [showDistribute, setShowDistribute] = useState(false);
  // Row Adjust lands the dialog on that agent instead of ignoring which row was clicked.
  const [distributeAgentName, setDistributeAgentName] = useState("");
  const openDistributeFor = useCallback((agentName?: string) => {
    setDistributeAgentName(agentName ?? "");
    setShowDistribute(true);
  }, []);
  const [showTeamFilters, setShowTeamFilters] = useState(false);

  // The Create menu and ⌘K arrive with ?distribute=1: open the dialog once.
  const openedFromLinkRef = useRef(false);
  useEffect(() => {
    if (openedFromLinkRef.current || searchParams.get("distribute") !== "1") return;
    openedFromLinkRef.current = true;
    openDistributeFor();
  }, [searchParams, openDistributeFor]);

  // Agent detail dialog
  const [detailAgent, setDetailAgent] = useState<TeamProfile | null>(null);

  // Pagination
  const [teamPage, setTeamPage] = useState(1);
  const [teamPageSize, setTeamPageSize] = useState(10);

  useEffect(() => {
    setYearFilter(initialYearFilter);
  }, [initialYearFilter]);

  const fetchOwn = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-agent/target-profiles?year=${yearFilter}&view=own`);
      if (res.ok) {
        const data = await res.json();
        setOwnProfile(data.profile ?? null);
      }
    } catch { toast.error(t("failedLoadTargets")); }
    finally { setLoading(false); }
  }, [yearFilter, t]);

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(yearFilter),
        view: "team",
        page: String(teamPage),
        limit: String(teamPageSize),
      });
      if (teamSearch.trim()) params.set("search", teamSearch.trim());
      if (teamRiskFilter !== "all") params.set("risk", teamRiskFilter);
      if (teamCompletionFilter !== "all") params.set("completion", teamCompletionFilter);
      if (teamTerritoryFilter !== "all") params.set("territory", teamTerritoryFilter);
      const res = await fetch(`/api/super-agent/target-profiles?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTeamProfiles(data.profiles ?? []);
        setTeamTotal(data.total ?? 0);
        setTeamTotalPages(data.totalPages ?? 1);
        if (data.totals) setTeamTotals(data.totals);
        if (data.overview) setTeamOverview(data.overview);
        // The team endpoint also returns the own profile, which saves a separate call.
        if (data.ownProfile) setOwnProfile(data.ownProfile);
      }
    } catch { toast.error(t("failedLoadTeamTargets")); }
    finally { setTeamLoading(false); }
  }, [teamCompletionFilter, teamPage, teamPageSize, teamRiskFilter, teamSearch, teamTerritoryFilter, yearFilter, t]);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(false);
    try {
      const res = await fetch(`/api/super-agent/target-profiles/analytics?year=${yearFilter}`);
      if (res.ok) setAnalytics(await res.json());
      else setAnalyticsError(true);
    } catch { setAnalyticsError(true); }
    finally { setAnalyticsLoading(false); }
  }, [yearFilter]);

  useEffect(() => { fetchOwn(); }, [fetchOwn]);
  useEffect(() => { fetchTeam(); }, [fetchTeam]);
  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // Reset page when filters change
  useEffect(() => { setTeamPage(1); }, [teamSearch, teamRiskFilter, teamCompletionFilter, teamTerritoryFilter]);

  const currency = ownProfile?.currency ?? teamTotals.profit.currency ?? "AED";
  const money = (value: number, notation: "standard" | "compact" = "standard") => formatProfit(value, currency, locale, notation);
  const territoryOptions = [
    { value: "all", label: t("allTerritories") },
    ...teamOverview.territories.map((territory) => ({ value: territory, label: territory })),
  ];
  const currencyLabel = teamOverview.currencyCount === 1
    ? teamOverview.currencyLabel
    : t("currencyCount", { count: teamOverview.currencyCount });

  // Budget: what the team holds against the super agent's own target.
  const ownTarget = ownProfile?.profitTarget ?? 0;
  const teamTargetSum = teamTotals.profit.target;
  const unallocated = Math.max(0, ownTarget - teamTargetSum);

  const territoryOf = (agent: TeamProfile) => agent.territory ?? agent.region ?? "";
  const lastUpdate = (agent: TeamProfile) => {
    const value = agent.lastActivityAt ?? agent.updatedAt;
    const formatted = value ? formatDate(value, { month: "short", day: "numeric" }, locale) : "—";
    return formatted === "—" ? t("noUpdate") : formatted;
  };
  const monthStatus = (agent: TeamProfile) => {
    const month = new Date().getMonth() + 1;
    const row = agent.monthlyAchievements.find((entry) => entry.month === month);
    if (!row || row.profitTarget === 0) return t("noMonthTarget");
    return row.profitProgress >= 75 ? t("monthOnTrack") : row.profitProgress > 0 ? t("monthBehind") : t("monthNotStarted");
  };

  // Team-table export via the shared hook (same as leads/commissions).
  const teamExportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("csvHeaderAgent"), key: "assigneeName" },
    { header: t("csvHeaderEmail"), key: "assigneeEmail" },
    { header: t("csvHeaderTerritory"), key: "territory", formatter: (_v, row) => (row.territory as string) || (row.region as string) || t("unassigned") },
    { header: t("csvHeaderCurrency"), key: "currency" },
    { header: t("csvHeaderProfitTarget"), key: "profitTarget" },
    { header: t("csvHeaderProfitAchieved"), key: "profitAchieved" },
    { header: t("csvHeaderProgressPercent"), key: "profitProgress" },
    { header: t("csvHeaderStage"), key: "profitProgress", formatter: (v) => t(getCompletionStage(Number(v ?? 0))) },
    { header: t("csvHeaderRisk"), key: "riskScore", formatter: (v) => t(String(v ?? "low")) },
    { header: t("csvHeaderLastUpdate"), key: "lastActivityAt", formatter: (_v, row) => lastUpdate(row as unknown as TeamProfile) },
  ];

  const { handleExportCsv: handleExportTeamCsv } = useTableExport({
    data: teamProfiles as unknown as Record<string, unknown>[],
    columns: teamExportColumns,
    filename: `team-targets-${yearFilter}`,
    title: t("saTitle"),
  });

  const teamFiltersActive = teamSearch.trim().length > 0 || teamRiskFilter !== "all" || teamCompletionFilter !== "all" || teamTerritoryFilter !== "all";
  const hasActiveDashboardFilters = yearFilter !== currentYear || teamFiltersActive;

  const handleResetDashboard = () => {
    setYearFilter(currentYear);
    setTeamSearch("");
    setTeamTerritoryFilter("all");
    setTeamCompletionFilter("all");
    setTeamRiskFilter("all");
  };

  const reportHref = (agentUserId?: string) =>
    `/${locale}/super-agent/target-report?year=${yearFilter}${agentUserId ? `&agentId=${agentUserId}` : ""}`;

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("saTitle")}
        description={t("saDescription")}
        inlineActions
      >
        <Badge variant="outline" className="rounded-full px-2.5 py-1.5 sm:px-3">
          <CircleDollarSign className="h-3.5 w-3.5 sm:me-1.5" /> <span className="hidden sm:inline">{currencyLabel}</span>
        </Badge>
      </SuperAgentPageIntro>

      <div className="flex flex-wrap items-center gap-2">
        <TargetYearSelect
          value={String(yearFilter)}
          onChange={(value) => setYearFilter(Number.parseInt(value, 10) || currentYear)}
          label={t("yearLabel")}
          years={defaultTargetYears()}
        />
        <Button variant="outline" size="sm" onClick={handleResetDashboard} aria-label={t("reset")} className="h-10 rounded-xl" disabled={!hasActiveDashboardFilters}>
          <RotateCcw className="h-3.5 w-3.5 sm:me-1.5" /> <span className="hidden sm:inline">{t("reset")}</span>
        </Button>
        <div className="flex rounded-xl border border-border/60 bg-background p-0.5" role="tablist" aria-label={t("tabsLabel")}>
          {(["own", "team", "analytics"] as const).map((key) => (
            <Button
              key={key}
              role="tab"
              aria-selected={tab === key}
              variant={tab === key ? "default" : "ghost"}
              size="sm"
              onClick={() => setTab(key)}
              className="h-9 flex-1 rounded-lg px-3"
            >
              {t(key === "own" ? "mine" : key)}
            </Button>
          ))}
        </div>
        {tab === "team" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTeamFilters((v) => !v)}
            aria-expanded={showTeamFilters}
            aria-label={t("filters")}
            className={showTeamFilters ? "h-10 rounded-xl border-primary/30 bg-primary/10 text-primary" : "h-10 rounded-xl"}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 sm:me-1.5" /> <span className="hidden sm:inline">{t("filters")}</span>
          </Button>
        )}
        {tab === "team" && showTeamFilters ? (
          <>
            <div className="relative min-w-[220px] flex-1 basis-full sm:basis-auto">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("searchAgentsTerritory")}
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder={t("searchAgentsTerritory")}
                className="h-10 rounded-xl border-border bg-background ps-9 text-sm"
              />
            </div>
            <SearchableSelect
              options={territoryOptions}
              value={teamTerritoryFilter}
              onValueChange={setTeamTerritoryFilter}
              placeholder={t("territory")}
              className="h-10 w-40 rounded-xl"
            />
            <SearchableSelect
              options={[
                { value: "all", label: t("allStages") },
                { value: "not_started", label: t("notStarted") },
                { value: "in_progress", label: t("inProgress") },
                { value: "completed", label: t("completed") },
              ]}
              value={teamCompletionFilter}
              onValueChange={(value) => setTeamCompletionFilter(value as "all" | CompletionStage)}
              placeholder={t("stage")}
              className="h-10 w-36 rounded-xl"
            />
            <SearchableSelect
              options={[
                { value: "all", label: t("allRisk") },
                { value: "high", label: t("highRisk") },
                { value: "medium", label: t("mediumRisk") },
                { value: "low", label: t("lowRisk") },
              ]}
              value={teamRiskFilter}
              onValueChange={(value) => setTeamRiskFilter(value as "all" | "high" | "medium" | "low")}
              placeholder={t("risk")}
              className="h-10 w-32 rounded-xl"
            />
            <Button variant="outline" size="sm" className="h-10 gap-0 rounded-xl sm:gap-2" onClick={handleExportTeamCsv} aria-label={t("export")} disabled={teamProfiles.length === 0}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">{t("export")}</span>
            </Button>
          </>
        ) : null}
        <Link href={reportHref()} className="ms-auto">
          <Button variant="outline" size="sm" className="h-10 gap-0 rounded-xl sm:gap-2" aria-label={t("openReport")}>
            <FileText className="h-4 w-4" /> <span className="hidden sm:inline">{t("openReport")}</span>
          </Button>
        </Link>
        <Button className="gap-0 rounded-xl bg-blue-700 px-3 text-white hover:bg-blue-800 sm:gap-2 sm:px-4" onClick={() => openDistributeFor()} aria-label={t("distribute")}>
          <SplitSquareVertical className="h-4 w-4" /> <span className="hidden sm:inline">{t("distribute")}</span>
        </Button>
      </div>

      {/* ============ OWN TAB ============ */}
      {tab === "own" && (
        <div className="space-y-3 sm:space-y-4">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : !ownProfile ? (
            <TargetEmptyState title={t("noTargetAssigned")} description={t("saNoTargetHint")} />
          ) : (
            <>
              <div className="workspace-glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="workspace-tone-violet rounded-lg p-1.5"><TrendingUp className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold">{t("executionStatus")}</p>
                    <p className="text-xs text-muted-foreground">{t("executionStatusHint")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CompletionBadge stage={getCompletionStage(ownProfile.profitProgress)} />
                  <RiskBadge risk={ownProfile.riskScore} />
                  <IncentiveTierBadge tier={ownProfile.incentiveTier ?? "none"} />
                </div>
              </div>

              <div className="workspace-glass-panel panel-body rounded-2xl">
                <div className="flex flex-wrap items-center justify-center gap-8">
                  <ProgressRing value={ownProfile.profitProgress} label={t("profitTarget")} sublabel={`${money(ownProfile.profitAchieved)} / ${money(ownProfile.profitTarget)}`} color="#059669" />
                </div>
              </div>

              <TargetSummaryCard profitTarget={ownProfile.profitTarget} profitAchieved={ownProfile.profitAchieved} currency={ownProfile.currency} />
            </>
          )}
        </div>
      )}

      {/* ============ ANALYTICS TAB ============ */}
      {tab === "analytics" && (
        <div className="space-y-4">
          {analyticsLoading ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : analytics ? (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <DashboardMetricCard
                  label={t("teamAgents")}
                  value={analytics.teamSummary.totalAgents}
                  helper={t("teamAgentsHelper")}
                  icon={<Users className="h-5 w-5" />}
                  tone="blue"
                />
                <DashboardMetricCard
                  label={t("avgPerformance")}
                  value={`${analytics.teamSummary.avgProgress}%`}
                  helper={t("avgPerformanceHelper")}
                  icon={<TrendingUp className="h-5 w-5" />}
                  progress={analytics.teamSummary.avgProgress}
                  tone="green"
                />
                <DashboardMetricCard
                  label={t("highRisk")}
                  value={analytics.teamSummary.highRiskCount}
                  helper={t("highRiskHelper")}
                  icon={<AlertCircle className="h-5 w-5" />}
                  tone="red"
                />
                <DashboardMetricCard
                  label={t("platinum")}
                  value={analytics.teamSummary.incentiveBreakdown.platinum}
                  helper={t("platinumHelper")}
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  tone="violet"
                />
              </div>

              {analytics.monthlyTeamTrend.some((row) => row.profitTarget > 0 || row.profitAchieved > 0) && (
                <SuperAgentSection eyebrow={t("monthlyBreakdown")} title={t("teamTrendTitle")}>
                  <div className="card-pad rounded-2xl border border-border/60 bg-card">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={analytics.monthlyTeamTrend.map((row) => ({
                          month: new Date(Date.UTC(2000, row.month - 1, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" }),
                          target: row.profitTarget,
                          profit: row.profitAchieved,
                        }))}
                        barGap={2}
                        barCategoryGap="20%"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => money(Number(value), "compact")} />
                        <ReTooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                          formatter={(value) => [money(Number(value)), undefined]}
                        />
                        <Bar dataKey="target" name={t("seriesTarget")} fill="#cbd5e1" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="profit" name={t("seriesProfit")} fill="#10b981" radius={[2, 2, 0, 0]} />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </SuperAgentSection>
              )}

              <SuperAgentSection eyebrow={t("rankingsEyebrow")} title={t("teamPerformanceLeaderboard")}>
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="w-16 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("rank")}</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("agent")}</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("progress")}</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("risk")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.agentRankings.slice(0, 5).map((agent) => (
                        <TableRow key={agent._id} className="group">
                          <TableCell className="text-center text-sm font-bold tabular-nums">#{agent.rank}</TableCell>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2">
                              <UserAvatar name={agent.assigneeName} className="h-8 w-8 shrink-0" colorful />
                              <div className="min-w-0">
                                <p className="truncate font-medium">{agent.assigneeName}</p>
                                <p className="text-xs tabular-nums text-muted-foreground">
                                  {formatProfit(agent.profitAchieved, agent.currency, locale)} / {formatProfit(agent.profitTarget, agent.currency, locale)}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center"><PerformanceBadge pct={agent.profitProgress} /></TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <div className="flex flex-col items-start gap-1.5">
                                <RiskBadge risk={agent.riskScore} />
                                <IncentiveTierBadge tier={agent.incentiveTier ?? "none"} />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </SuperAgentSection>
            </>
          ) : analyticsError ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-8 text-center">
              <p className="text-sm text-destructive">{t("failedLoadAnalytics")}</p>
              <button
                type="button"
                onClick={() => fetchAnalytics()}
                className="shrink-0 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-all hover:bg-destructive/20"
              >
                {t("retry")}
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
          ) : !ownProfile ? (
            <TargetEmptyState title={t("noTargetAssigned")} description={t("saNoTargetHint")} />
          ) : (
            <SuperAgentSection eyebrow={t("monthlyBreakdown")} title={t("monthlyBreakdownDescription")}>
              <MonthlyDistributionGrid months={ownProfile.monthlyAchievements} currency={ownProfile.currency} />
            </SuperAgentSection>
          )}
        </div>
      )}

      {/* ============ TEAM TAB ============ */}
      {tab === "team" && (
        <div className="space-y-3">
          <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <DashboardMetricCard
              label={t("teamProfit")}
              value={money(teamTotals.profit.achieved, "compact")}
              helper={t("teamProfitHelper", { assigned: money(teamTotals.profit.target, "compact") })}
              icon={<CircleDollarSign className="h-5 w-5" />}
              progress={pct(teamTotals.profit.achieved, teamTotals.profit.target)}
              tone="green"
            />
            <DashboardMetricCard
              label={t("unallocatedBudget")}
              value={money(unallocated, "compact")}
              helper={t("unallocatedBudgetHelper", { total: money(ownTarget, "compact") })}
              icon={<Wallet className="h-5 w-5" />}
              progress={pct(teamTargetSum, ownTarget)}
              tone="amber"
            />
            <DashboardMetricCard
              label={t("teamCompletion")}
              value={`${teamTotals.avgProgress}%`}
              helper={t("teamCompletionHelper", { inProgress: teamOverview.stageCounts.in_progress, completed: teamOverview.stageCounts.completed })}
              icon={<TrendingUp className="h-5 w-5" />}
              progress={teamTotals.avgProgress}
              tone="blue"
            />
            <DashboardMetricCard
              label={t("atRisk")}
              value={teamTotals.riskBreakdown.high}
              helper={t("atRiskHelper", { pending: teamOverview.pendingActions })}
              icon={<ClipboardList className="h-5 w-5" />}
              tone="red"
            />
          </section>

          {/* Agent table */}
          <div className="min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("agent")}</TableHead>
                  <TableHead className="hidden text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground md:table-cell">{t("territory")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("profitHeader")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("progress")}</TableHead>
                  <TableHead className="hidden text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground md:table-cell">{t("stage")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("risk")}</TableHead>
                  <TableHead className="hidden text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground md:table-cell">{t("colUpdate")}</TableHead>
                  <TableHead className="text-end text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamLoading ? (
                  <TableBodySkeleton rows={3} cols={8} />
                ) : teamProfiles.length === 0 && teamFiltersActive ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="py-12">
                      <TargetEmptyState
                        title={t("noAgentsMatchFilters")}
                        description={t("noMatchHint")}
                        action={
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTeamSearch("");
                              setTeamRiskFilter("all");
                              setTeamCompletionFilter("all");
                              setTeamTerritoryFilter("all");
                            }}
                            className="mt-2 rounded-lg"
                          >
                            {t("clearFilters")}
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : teamProfiles.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="py-12">
                      <TargetEmptyState
                        title={t("noAgentTargets")}
                        description={ownProfile ? t("distributeEmptyHint") : t("saNoTargetHint")}
                        action={ownProfile ? (
                          <Button size="sm" onClick={() => openDistributeFor()} className="mt-2 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                            <SplitSquareVertical className="h-4 w-4" /> {t("distribute")}
                          </Button>
                        ) : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  teamProfiles.map((agent) => (
                    <TableRow key={agent._id} className="group">
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar name={agent.assigneeName} email={agent.assigneeEmail} className="h-9 w-9 shrink-0" colorful />
                          <div className="min-w-0 space-y-0.5">
                            <p className="truncate font-medium">{agent.assigneeName}</p>
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{agent.assigneeEmail}</span>
                            </p>
                            <span className="text-[11px] text-muted-foreground">{monthStatus(agent)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {territoryOf(agent) && territoryOf(agent) !== "Unassigned" ? territoryOf(agent) : t("unassigned")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <CompactProgress
                          achieved={agent.profitAchieved}
                          target={agent.profitTarget}
                          progress={agent.profitProgress}
                          currency={agent.currency}
                          className="min-w-0"
                        />
                      </TableCell>
                      <TableCell><PerformanceBadge pct={agent.profitProgress} /></TableCell>
                      <TableCell className="hidden md:table-cell"><CompletionBadge stage={getCompletionStage(agent.profitProgress)} /></TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1.5">
                          <RiskBadge risk={agent.riskScore} />
                          <IncentiveTierBadge tier={agent.incentiveTier ?? "none"} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{lastUpdate(agent)}</TableCell>
                      <TableCell className="text-end">
                        <RowActions
                          name={agent.assigneeName}
                          labelsFrom="wide"
                          quick={[{ key: "view", label: t("viewDetails"), icon: Eye, onSelect: () => setDetailAgent(agent) }]}
                          menu={[
                            { key: "adjust", label: t("adjustTarget"), icon: Pencil, onSelect: () => openDistributeFor(agent.assigneeName) },
                            { key: "report", label: t("openAgentReport"), icon: FileText, href: reportHref(agent.assigneeId) },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            page={teamPage}
            totalPages={teamTotalPages}
            total={teamTotal}
            limit={teamPageSize}
            onPageChange={setTeamPage}
            onLimitChange={(size) => { setTeamPageSize(size); setTeamPage(1); }}
          />
        </div>
      )}

      <TeamAllocationDialog
        open={showDistribute}
        onOpenChange={setShowDistribute}
        year={yearFilter}
        supervisorProfile={ownProfile ? { profitTarget: ownProfile.profitTarget, profitAchieved: ownProfile.profitAchieved, currency: ownProfile.currency } : null}
        teamProfiles={teamProfiles.map((profile) => ({
          assigneeId: profile.assigneeId,
          profitTarget: profile.profitTarget,
          profitProgress: profile.profitProgress,
          distributionStrategy: profile.distributionStrategy,
          periodType: profile.periodType,
          periods: profile.periods,
        }))}
        onSuccess={() => Promise.all([fetchTeam(), fetchOwn(), fetchAnalytics()]).then(() => undefined)}
        initialFilterName={distributeAgentName}
      />

      <AgentDetailDialog
        open={Boolean(detailAgent)}
        onOpenChange={(open) => { if (!open) setDetailAgent(null); }}
        agent={detailAgent}
        year={yearFilter}
        onOpenReport={(agent) => router.push(reportHref(agent.assigneeId))}
      />
    </div>
  );
}
