"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { PageHero } from "@/components/shared/PageHero";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CompactProgress, RiskBadge, PerformanceBadge,
  MonthlyDistributionGrid, TargetEmptyState,
  TargetSummaryCard, CompletionBadge,
  CompletionStage, getCompletionStage, IncentiveTierBadge,
} from "@/components/features/targets/TargetComponents";
import { TeamAllocationDialog } from "@/components/features/targets/TeamAllocationDialog";
import { AgentDetailDialog } from "@/components/features/targets/AgentDetailDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  Building2, Users, DollarSign, SplitSquareVertical,
  TrendingUp, CalendarDays, RotateCcw, Download,
  Search, AlertCircle, CheckCircle2,
  ClipboardList, TimerReset, Target, Info, MapPin,
  Eye, SlidersHorizontal, CircleDollarSign,
  ChevronLeft, ChevronRight, BarChart3,
} from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EnrichedProfile {
  _id: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  region?: string;
  territory?: string;
  regionalCurrency?: string;
  lastActivityAt?: string;
  createdAt?: string;
  updatedAt?: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  currency: string;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  employerProgress: number;
  employeeProgress: number;
  financeProgress: number;
  overallProgress: number;
  employerPending: number;
  employeePending: number;
  financePending: number;
  riskScore: "high" | "medium" | "low";
  incentiveTier: "none" | "bronze" | "silver" | "gold" | "platinum";
  monthlyAchievements: {
    month: number;
    employerTarget: number;
    employeeTarget: number;
    financeTarget: number;
    employerAchieved: number;
    employeeAchieved: number;
    financeAchieved: number;
    overallProgress: number;
  }[];
  status: string;
}

interface TeamOverview {
  stageCounts: Record<CompletionStage, number>;
  territories: string[];
  currencyLabel: string;
  attention: { behindEmployer: number; behindEmployee: number; behindFinance: number; highRisk: number };
  topPerformers: EnrichedProfile[];
  underPerformers: EnrichedProfile[];
  pendingActions: number;
  pendingApprovals: number;
  deadlineAlerts: EnrichedProfile[];
}

interface SuperAgentTargetAnalytics {
  teamSummary: {
    totalAgents: number;
    avgPerformance: number;
    highRiskCount: number;
    onTrackCount: number;
    incentiveBreakdown: {
      bronze: number;
      silver: number;
      gold: number;
      platinum: number;
    };
  };
  agentRankings: {
    rank: number;
    _id: string;
    assigneeName: string;
    overallProgress: number;
    riskScore: "high" | "medium" | "low";
    incentiveTier: "none" | "bronze" | "silver" | "gold" | "platinum";
  }[];
}

type MetricTone = "blue" | "green" | "violet" | "amber" | "red";

interface DashboardMetricCardProps {
  label: string;
  value: ReactNode;
  helper: string;
  icon: ReactNode;
  progress?: number;
  tone?: MetricTone;
}

interface SideListCardProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}

// MONTHS_SHORT resolved in component with useTranslations hook, see below

const METRIC_TONE_CLASS_MAP: Record<MetricTone, string> = {
  blue: "workspace-tone-sky",
  green: "workspace-tone-emerald",
  violet: "workspace-tone-violet",
  amber: "workspace-tone-amber",
  red: "workspace-tone-rose",
};

function formatCompactCurrency(value: number, currency = "AED"): string {
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${formatCount(value)}`;
}

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

// Returns key if invalid; caller resolves with t()
function formatShortDate(value?: string): string | null {
  if (!value) return "noUpdate";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "noUpdate";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

// Returns key; caller resolves with t()
function getTerritory(agent: EnrichedProfile): string {
  return agent.territory ?? agent.region ?? "unassigned";
}

// Returns { key, label, progress } for caller to resolve with t()
interface RiskReasonResult {
  key: string;
  label: string;
  progress: number;
}
function getRiskReason(agent: EnrichedProfile): RiskReasonResult {
  const metrics = [
    { labelKey: "metricEmployer", progress: agent.employerProgress },
    { labelKey: "metricEmployee", progress: agent.employeeProgress },
    { labelKey: "metricRevenue", progress: agent.financeProgress },
  ].sort((a, b) => a.progress - b.progress);

  return { key: "riskReason", label: metrics[0].labelKey, progress: metrics[0].progress };
}

// Returns key; caller resolves with t()
function getNextAction(agent: EnrichedProfile): string {
  const metrics = [
    { key: "addEmployers", progress: agent.employerProgress },
    { key: "closePlacements", progress: agent.employeeProgress },
    { key: "pushRevenue", progress: agent.financeProgress },
  ].sort((a, b) => a.progress - b.progress);

  if (getCompletionStage(agent.overallProgress) === "completed") return "maintainPace";
  return metrics[0].key;
}

// Returns { key, month } for caller to resolve month name and then format message
interface DeadlineAlertResult {
  key: string;
  month?: number;
}
function getDeadlineAlert(agent: EnrichedProfile): DeadlineAlertResult {
  const currentMonth = new Date().getMonth() + 1;
  const currentMonthData = agent.monthlyAchievements.find((month) => month.month === currentMonth);
  if (!currentMonthData) return { key: "annualTarget" };
  if (currentMonthData.overallProgress >= 75) return { key: "onTrack", month: currentMonth };
  if (currentMonthData.overallProgress > 0) return { key: "behindPace", month: currentMonth };
  return { key: "notStarted", month: currentMonth };
}

// Returns key; caller resolves with t()
function getDistributionStatus(agent: EnrichedProfile): string {
  if (getCompletionStage(agent.overallProgress) === "completed") return "completed";
  if (agent.employerTarget + agent.employeeTarget + agent.financeTarget > 0) return "distributed";
  return "notDistributed";
}

function DashboardMetricCard({
  label,
  value,
  helper,
  icon,
  progress,
  tone = "blue",
}: DashboardMetricCardProps) {
  return (
    <div className="workspace-glass-panel card-pad rounded-xl">
      {/* Phones: label + value + slim progress only — the helper sentence and
          icon chip made six of these a three-screen wall of cards. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-[11px] sm:tracking-[0.16em]">{label}</p>
          <div className="mt-1 text-base font-semibold tracking-tight text-foreground sm:mt-2 sm:text-xl">{value}</div>
          <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">{helper}</p>
        </div>
        <div className={`${METRIC_TONE_CLASS_MAP[tone]} hidden rounded-xl p-2 sm:block`}>{icon}</div>
      </div>
      {typeof progress === "number" ? (
        <div className="mt-2 flex items-center gap-2 sm:mt-4">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60 sm:h-2">
            <div className={`h-full rounded-full ${getProgressColor(progress)}`} style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          <span className={`min-w-10 text-right text-xs font-bold tabular-nums ${getProgressTextColor(progress)} max-sm:hidden`}>{progress}%</span>
        </div>
      ) : null}
    </div>
  );
}

function SideListCard({ title, actionLabel, onAction, children }: SideListCardProps) {
  return (
    <aside className="workspace-glass-panel card-pad rounded-xl">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">{title}</h3>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="text-xs font-semibold text-primary hover:text-primary/80">
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentTargetProfilesPage() {
  const t = useTranslations("targets");
  const searchParams = useSearchParams();
  const currentYear = new Date().getFullYear();

  // Translated month names
  const monthsShort = useMemo(() => [
    t("months.jan"),
    t("months.feb"),
    t("months.mar"),
    t("months.apr"),
    t("months.may"),
    t("months.jun"),
    t("months.jul"),
    t("months.aug"),
    t("months.sep"),
    t("months.oct"),
    t("months.nov"),
    t("months.dec"),
  ], [t]);

  // Resolve helper function returns with t()
  const resolveRiskReason = (agent: EnrichedProfile) => {
    const reason = getRiskReason(agent);
    return t("riskReason", { label: t(reason.label), progress: reason.progress });
  };

  const resolveDeadlineAlert = (agent: EnrichedProfile) => {
    const alert = getDeadlineAlert(agent);
    if (!alert.month) return t(alert.key);
    return t(alert.key, { month: monthsShort[alert.month - 1] });
  };
  const requestedYear = Number.parseInt(searchParams.get("year") ?? "", 10);
  const initialYearFilter = Number.isFinite(requestedYear) && requestedYear > 0
    ? requestedYear
    : currentYear;

  const [yearFilter, setYearFilter] = useState(initialYearFilter);
  const [yearInput, setYearInput] = useState(String(initialYearFilter));
  const [tab, setTab] = useState<"own" | "team" | "analytics">("team");
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);

  // Own profile
  const [ownProfile, setOwnProfile] = useState<EnrichedProfile | null>(null);

  // Team
  const [teamProfiles, setTeamProfiles] = useState<EnrichedProfile[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [teamTotalPages, setTeamTotalPages] = useState(1);
  const [teamTotals, setTeamTotals] = useState({
    employer: { target: 0, achieved: 0 },
    employee: { target: 0, achieved: 0 },
    finance: { target: 0, achieved: 0 },
    avgPerformance: 0,
    riskBreakdown: { high: 0, medium: 0, low: 0 },
  });
  const [teamOverview, setTeamOverview] = useState<TeamOverview>({
    stageCounts: { not_started: 0, in_progress: 0, completed: 0 },
    territories: [],
    currencyLabel: "AED",
    attention: { behindEmployer: 0, behindEmployee: 0, behindFinance: 0, highRisk: 0 },
    topPerformers: [],
    underPerformers: [],
    pendingActions: 0,
    pendingApprovals: 0,
    deadlineAlerts: [],
  });
  const [analytics, setAnalytics] = useState<SuperAgentTargetAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamRiskFilter, setTeamRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [teamCompletionFilter, setTeamCompletionFilter] = useState<"all" | CompletionStage>("all");
  const [teamTerritoryFilter, setTeamTerritoryFilter] = useState("all");

  // Distribute dialog
  const [showDistribute, setShowDistribute] = useState(false);
  const [showTeamFilters, setShowTeamFilters] = useState(false);

  // Agent detail dialog
  const [detailAgent, setDetailAgent] = useState<EnrichedProfile | null>(null);

  // Pagination
  const [teamPage, setTeamPage] = useState(1);
  const [teamPageSize, setTeamPageSize] = useState(10);

  // Insights dialog
  const [showInsights, setShowInsights] = useState(false);

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
  }, [yearFilter]);

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
        // Team endpoint also returns ownProfile — update it to avoid separate call
        if (data.ownProfile) setOwnProfile(data.ownProfile);
      }
    } catch { toast.error(t("failedLoadTeamTargets")); }
    finally { setTeamLoading(false); }
  }, [teamCompletionFilter, teamPage, teamPageSize, teamRiskFilter, teamSearch, teamTerritoryFilter, yearFilter]);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/super-agent/target-profiles/analytics?year=${yearFilter}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch { /* ignore */ }
    finally { setAnalyticsLoading(false); }
  }, [yearFilter]);

  useEffect(() => { fetchOwn(); }, [fetchOwn]);
  useEffect(() => { fetchTeam(); }, [fetchTeam]);
  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // Reset page when filters change
  useEffect(() => { setTeamPage(1); }, [teamSearch, teamRiskFilter, teamCompletionFilter, teamTerritoryFilter]);

  const totalTeamPages = teamTotalPages;
  const paginatedTeamProfiles = teamProfiles;
  const territoryOptions = [
    { value: "all", label: t("allTerritories") },
    ...teamOverview.territories.map((territory) => ({ value: territory, label: territory })),
  ];
  const currencyLabel = teamOverview.currencyLabel;
  const filteredStageCounts = teamOverview.stageCounts;
  const filteredTotals = {
    agents: teamTotal,
    employer: teamTotals.employer,
    employee: teamTotals.employee,
    finance: teamTotals.finance,
    avgPerformance: teamTotals.avgPerformance,
    riskHigh: teamTotals.riskBreakdown.high,
  };
  const attentionItems = [
    { label: t("behindEmployer", { count: teamOverview.attention.behindEmployer }), tone: "bg-red-500" },
    { label: t("behindEmployee", { count: teamOverview.attention.behindEmployee }), tone: "bg-amber-500" },
    { label: t("behindFinance", { count: teamOverview.attention.behindFinance }), tone: "bg-amber-500" },
    { label: t("markedHighRisk", { count: teamOverview.attention.highRisk }), tone: "bg-red-500" },
  ];
  const topPerformers = teamOverview.topPerformers;
  const underPerformers = teamOverview.underPerformers;
  const pendingActionsCount = teamOverview.pendingActions;
  const pendingApprovalsCount = teamOverview.pendingApprovals;
  const deadlineAlerts = teamOverview.deadlineAlerts;

  const handleExport = () => {
    const csvRows = [
      [
        t("csvHeaderAgent"),
        t("csvHeaderEmail"),
        t("csvHeaderTerritory"),
        t("csvHeaderCurrency"),
        t("csvHeaderEmployerTarget"),
        t("csvHeaderEmployerAchieved"),
        t("csvHeaderEmployeeTarget"),
        t("csvHeaderEmployeeAchieved"),
        t("csvHeaderFinanceTarget"),
        t("csvHeaderFinanceAchieved"),
        t("csvHeaderOverallPercent"),
        t("csvHeaderStage"),
        t("csvHeaderRisk"),
        t("csvHeaderNextAction"),
        t("csvHeaderLastUpdate"),
      ].join(","),
      ...teamProfiles.map((r) => {
        const territory = getTerritory(r);
        const territoryDisplay = territory === "unassigned" ? t("unassigned") : territory;
        const lastUpdate = formatShortDate(r.lastActivityAt ?? r.updatedAt);
        const lastUpdateDisplay = lastUpdate ? lastUpdate : t("noUpdate");
        const nextActionKey = getNextAction(r);
        const nextActionDisplay = t(nextActionKey);
        return [
          `"${r.assigneeName}"`,
          `"${r.assigneeEmail}"`,
          `"${territoryDisplay}"`,
          r.currency ?? "AED",
          r.employerTarget,
          r.employerAchieved,
          r.employeeTarget,
          r.employeeAchieved,
          r.financeTarget,
          r.financeAchieved,
          r.overallProgress,
          t(getCompletionStage(r.overallProgress)),
          t(r.riskScore),
          `"${nextActionDisplay}"`,
          `"${lastUpdateDisplay}"`,
        ].join(",");
      }),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `team-targets-${yearFilter}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success(t("csvExported"));
  };

  const pct = (a: number, tgt: number) => tgt > 0 ? Math.round((a / tgt) * 100) : 0;
  const hasActiveDashboardFilters = yearFilter !== currentYear || teamSearch.trim().length > 0 || teamTerritoryFilter !== "all" || teamCompletionFilter !== "all" || teamRiskFilter !== "all";

  const handleResetDashboard = () => {
    setYearFilter(currentYear);
    setYearInput(String(currentYear));
    setTeamSearch("");
    setTeamTerritoryFilter("all");
    setTeamCompletionFilter("all");
    setTeamRiskFilter("all");
  };

  return (
    <div className="page-container">
      <PageHero
        icon={Target}
        title={t("title")}
        description={t("superAgentDescription")}
        actions={
          <Badge variant="outline" className="rounded-full px-2.5 py-1.5 sm:px-3">
            <CircleDollarSign className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{currencyLabel}</span>
          </Badge>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="number"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const parsed = parseInt(yearInput);
                  if (parsed >= 2020 && parsed <= 2099) setYearFilter(parsed);
                }
              }}
              className="h-10 w-28 rounded-xl border-border bg-background pl-9 text-sm"
            />
          </div>
          <Button
            variant="default"
            size="sm"
            className="h-10 rounded-xl px-3"
            disabled={parseInt(yearInput) === yearFilter || !yearInput || parseInt(yearInput) < 2020}
            onClick={() => {
              const parsed = parseInt(yearInput);
              if (parsed >= 2020 && parsed <= 2099) setYearFilter(parsed);
            }}
          >
            <CalendarDays className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t("go")}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetDashboard} className="h-10 rounded-xl" disabled={!hasActiveDashboardFilters}>
            <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t("reset")}</span>
          </Button>
          <div className="flex rounded-xl border border-border/60 bg-background p-0.5">
            <Button variant={tab === "own" ? "default" : "ghost"} size="sm" onClick={() => setTab("own")} className="h-9 flex-1 rounded-lg px-3">{t("mine")}</Button>
            <Button variant={tab === "team" ? "default" : "ghost"} size="sm" onClick={() => setTab("team")} className="h-9 flex-1 rounded-lg px-3">{t("team")}</Button>
            <Button variant={tab === "analytics" ? "default" : "ghost"} size="sm" onClick={() => setTab("analytics")} className="h-9 flex-1 rounded-lg px-3">{t("analytics")}</Button>
          </div>
          {tab === "team" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTeamFilters((v) => !v)}
              aria-expanded={showTeamFilters}
              className={showTeamFilters ? "h-10 rounded-xl border-primary/30 bg-primary/10 text-primary" : "h-10 rounded-xl"}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t("filters")}</span>
            </Button>
          )}
          {tab === "team" && showTeamFilters ? (
            <>
              <div className="relative min-w-[220px] flex-1 basis-full sm:basis-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder={t("searchAgentsTerritory")}
                  className="h-10 rounded-xl border-border bg-background pl-9 text-sm"
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
              <Button variant="outline" size="sm" className="h-10 gap-0 rounded-xl sm:gap-2" onClick={handleExport} disabled={teamProfiles.length === 0}>
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">{t("export")}</span>
              </Button>
            </>
          ) : null}
          <Button className="gap-0 rounded-xl bg-blue-700 px-3 text-white hover:bg-blue-800 sm:gap-2 sm:px-4" onClick={() => setShowDistribute(true)}>
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
            <TargetEmptyState title={t("noTargetsAssigned")} description={t("contactSupervisor")} />
          ) : (
            <>
              <div className="workspace-glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="workspace-tone-violet rounded-lg p-1.5"><TrendingUp className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold">{t("executionStatus")}</p>
                    <p className="text-xs text-muted-foreground">{t("executionStatusHelper")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CompletionBadge stage={getCompletionStage(ownProfile.overallProgress)} />
                  <RiskBadge risk={ownProfile.riskScore} />
                  <IncentiveTierBadge tier={ownProfile.incentiveTier ?? "none"} />
                </div>
              </div>

              <TargetSummaryCard
                compact
                employerTarget={ownProfile.employerTarget}
                employeeTarget={ownProfile.employeeTarget}
                financeTarget={ownProfile.financeTarget}
                employerAchieved={ownProfile.employerAchieved}
                employeeAchieved={ownProfile.employeeAchieved}
                financeAchieved={ownProfile.financeAchieved}
                currency={ownProfile.currency}
              />

              {/* Overall progress — compact single-line bar */}
              <div className="workspace-glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="workspace-tone-violet rounded-lg p-1.5"><TrendingUp className="h-4 w-4" /></div>
                  <span className="text-sm font-semibold">{t("overallProgress")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-48 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        ownProfile.overallProgress >= 75 ? "bg-emerald-500" :
                        ownProfile.overallProgress >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(ownProfile.overallProgress, 100)}%` }}
                    />
                  </div>
                  <span className={`text-lg font-bold tabular-nums ${
                    ownProfile.overallProgress >= 75 ? "text-emerald-600" :
                    ownProfile.overallProgress >= 40 ? "text-amber-600" : "text-red-500"
                  }`}>{ownProfile.overallProgress}%</span>
                </div>
              </div>

            </>
          )}
        </div>
      )}

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
                  value={`${analytics.teamSummary.avgPerformance}%`}
                  helper={t("avgPerformanceHelper")}
                  icon={<TrendingUp className="h-5 w-5" />}
                  progress={analytics.teamSummary.avgPerformance}
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

              <SuperAgentSection eyebrow={t("rankingsEyebrow")} title={t("teamPerformanceLeaderboard")}>
                <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("rank")}</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("agent")}</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("progress")}</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("risk")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.agentRankings.slice(0, 5).map((agent) => (
                        <TableRow key={agent._id}>
                          <TableCell className="text-center text-sm font-bold tabular-nums">#{agent.rank}</TableCell>
                          <TableCell>
                            <p className="font-medium">{agent.assigneeName}</p>
                          </TableCell>
                          <TableCell className="text-center"><PerformanceBadge pct={agent.overallProgress} /></TableCell>
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
          ) : null}

          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
          ) : !ownProfile ? (
            <TargetEmptyState title={t("noTargetsAssigned")} description={t("contactSupervisor")} />
          ) : ownProfile.monthlyAchievements.length === 0 ? (
            <TargetEmptyState title={t("noMonthlyAnalyticsYet")} description={t("monthlyDistributionInfo")} />
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
          <section className="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
            <DashboardMetricCard
              label={t("teamCompletion")}
              value={`${filteredTotals.avgPerformance}%`}
              helper={t("teamCompletionHelper", { inProgress: filteredStageCounts.in_progress, completed: filteredStageCounts.completed })}
              icon={<TrendingUp className="h-5 w-5" />}
              progress={filteredTotals.avgPerformance}
              tone="blue"
            />
            <DashboardMetricCard
              label={t("employerTarget")}
              value={<>{filteredTotals.employer.achieved}<span className="text-base text-muted-foreground"> / {filteredTotals.employer.target}</span></>}
              helper={t("employerTargetHelper", { balance: Math.max(0, filteredTotals.employer.target - filteredTotals.employer.achieved) })}
              icon={<Building2 className="h-5 w-5" />}
              progress={pct(filteredTotals.employer.achieved, filteredTotals.employer.target)}
              tone="green"
            />
            <DashboardMetricCard
              label={t("employeeTarget")}
              value={<>{filteredTotals.employee.achieved}<span className="text-base text-muted-foreground"> / {filteredTotals.employee.target}</span></>}
              helper={t("employeeTargetHelper", { balance: Math.max(0, filteredTotals.employee.target - filteredTotals.employee.achieved) })}
              icon={<Users className="h-5 w-5" />}
              progress={pct(filteredTotals.employee.achieved, filteredTotals.employee.target)}
              tone="violet"
            />
            <DashboardMetricCard
              label={t("revenueTarget")}
              value={formatCompactCurrency(filteredTotals.finance.achieved, ownProfile?.currency ?? "AED")}
              helper={t("revenueTargetHelper", { assigned: formatCompactCurrency(filteredTotals.finance.target, ownProfile?.currency ?? "AED") })}
              icon={<DollarSign className="h-5 w-5" />}
              progress={pct(filteredTotals.finance.achieved, filteredTotals.finance.target)}
              tone="amber"
            />
            <DashboardMetricCard
              label={t("atRisk")}
              value={filteredTotals.riskHigh}
              helper={t("atRiskHelper")}
              icon={<AlertCircle className="h-5 w-5" />}
              tone="red"
            />
            <DashboardMetricCard
              label={t("pendingActions")}
              value={pendingActionsCount}
              helper={t("pendingActionsHelper")}
              icon={<ClipboardList className="h-5 w-5" />}
              tone="blue"
            />
          </section>

          {/* Agent table */}
          <div className="min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("agent")}</TableHead>
                  <TableHead className="hidden md:table-cell text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("territory")}</TableHead>
                  <TableHead className="hidden md:table-cell text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {t("metricEmployer")}</div>
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {t("metricEmployee")}</div>
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> {t("metricRevenue")}</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("progress")}</TableHead>
                  <TableHead className="hidden md:table-cell text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("stage")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("risk")}</TableHead>
                  <TableHead className="hidden md:table-cell text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Update</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : teamProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-16 text-center">
                      <TargetEmptyState
                        title={t("noAgentTargets")}
                        description={t("distributeEmptyHint")}
                        action={
                          <Button size="sm" onClick={() => setShowDistribute(true)} className="mt-2 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                            <SplitSquareVertical className="h-4 w-4" /> {t("distribute")}
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : teamProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-16 text-center">
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
                ) : (
                  paginatedTeamProfiles.map((agent) => (
                    <TableRow key={agent._id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{agent.assigneeName}</p>
                          <p className="text-xs text-muted-foreground">{agent.assigneeEmail}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="info" className="px-2 py-0.5 text-[11px]">{t(getDistributionStatus(agent))}</Badge>
                            <span className="text-[11px] text-muted-foreground">{resolveDeadlineAlert(agent)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {getTerritory(agent) === "unassigned" ? t("unassigned") : getTerritory(agent)}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{agent.regionalCurrency ?? agent.currency}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <CompactProgress achieved={agent.employerAchieved} target={agent.employerTarget} progress={agent.employerProgress} type="employer" />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <CompactProgress achieved={agent.employeeAchieved} target={agent.employeeTarget} progress={agent.employeeProgress} type="employee" />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <CompactProgress achieved={agent.financeAchieved} target={agent.financeTarget} progress={agent.financeProgress} type="finance" currency={agent.currency} />
                      </TableCell>
                      <TableCell>
                        <PerformanceBadge pct={agent.overallProgress} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <CompletionBadge stage={getCompletionStage(agent.overallProgress)} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <RiskBadge risk={agent.riskScore} />
                          <IncentiveTierBadge tier={agent.incentiveTier ?? "none"} />
                          <p className="text-[11px] text-muted-foreground">{resolveRiskReason(agent)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm font-medium text-foreground">{formatShortDate(agent.lastActivityAt ?? agent.updatedAt ?? agent.createdAt) || t("noUpdate")}</p>
                        <p className="text-[11px] text-muted-foreground">{t(getNextAction(agent))}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="iconDense"
                                  className="rounded-lg"
                                  aria-label={`Focus ${agent.assigneeName}`}
                                  onClick={() => setDetailAgent(agent)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View agent details</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="iconDense"
                                  className="rounded-lg"
                                  aria-label={`Adjust target for ${agent.assigneeName}`}
                                  onClick={() => setShowDistribute(true)}
                                >
                                  <SlidersHorizontal className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Adjust distribution</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination & Insights */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/80 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Showing {teamTotal === 0 ? 0 : ((teamPage - 1) * teamPageSize) + 1}–{Math.min(teamPage * teamPageSize, teamTotal)} of {teamTotal}</span>
              <Select value={String(teamPageSize)} onValueChange={(val) => { setTeamPageSize(Number(val)); setTeamPage(1); }}>
                <SelectTrigger className="w-auto rounded-md border border-border bg-background px-2 py-1 text-xs h-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 / page</SelectItem>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="dense" className="gap-1 rounded-lg px-3 text-xs font-medium" onClick={() => setShowInsights(true)}>
                <BarChart3 className="h-3.5 w-3.5" /> Insights
              </Button>
              <div className="mx-2 h-5 w-px bg-border" />
              <Button variant="outline" size="iconDense" className="" disabled={teamPage <= 1} onClick={() => setTeamPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[3rem] text-center text-xs font-medium">{teamPage} / {totalTeamPages}</span>
              <Button variant="outline" size="iconDense" className="" disabled={teamPage >= totalTeamPages} onClick={() => setTeamPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Insights Dialog */}
      <Dialog open={showInsights} onOpenChange={setShowInsights}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-primary" /> Team Insights
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 sm:space-y-4 overflow-y-auto pr-1" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <style>{`.insights-scroll::-webkit-scrollbar { display: none; }`}</style>

            {/* Target Progress Chart */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Progress Overview</h4>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: "Employer", target: filteredTotals.employer.target, achieved: filteredTotals.employer.achieved },
                    { name: "Employee", target: filteredTotals.employee.target, achieved: filteredTotals.employee.achieved },
                    { name: "Revenue", target: filteredTotals.finance.target / 1000, achieved: filteredTotals.finance.achieved / 1000 },
                  ]} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="target" fill="#94a3b8" name="Target" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="achieved" fill="#3b82f6" name="Achieved" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">Revenue values shown in thousands (K)</p>
            </div>

            {/* Risk Distribution */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk Distribution</h4>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "High", value: teamTotals.riskBreakdown.high },
                          { name: "Medium", value: teamTotals.riskBreakdown.medium },
                          { name: "Low", value: teamTotals.riskBreakdown.low },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={50}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        <Cell fill="#ef4444" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#10b981" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team Summary</h4>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">Total agents</span>
                    <span className="text-sm font-bold">{teamTotal}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">Avg performance</span>
                    <span className="text-sm font-bold">{filteredTotals.avgPerformance}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">At risk</span>
                    <span className="text-sm font-bold text-red-500">{filteredTotals.riskHigh}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Attention Required */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attention Required</h4>
              <div className="space-y-1.5">
                {attentionItems.map((item) => (
                  <div key={item.label} className="flex items-start gap-2 text-sm text-foreground">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.tone}`} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Agent Performance Comparison */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent Performance Comparison</h4>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamProfiles.map((a) => ({
                    name: a.assigneeName.split(" ").slice(0, 2).join(" "),
                    employer: a.employerProgress,
                    employee: a.employeeProgress,
                    finance: a.financeProgress,
                  }))} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                    <ReTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="employer" fill="#6366f1" name="Employer %" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="employee" fill="#06b6d4" name="Employee %" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="finance" fill="#f59e0b" name="Revenue %" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top & Under Performers */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Performers</h4>
                {topPerformers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topPerformers.map((agent, index) => (
                      <div key={agent._id} className="flex items-center gap-2.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-[11px] font-bold text-emerald-600">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{agent.assigneeName}</p>
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted/60">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(agent.overallProgress, 100)}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-bold tabular-nums text-emerald-600">{agent.overallProgress}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Under Performers</h4>
                {underPerformers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {underPerformers.map((agent) => (
                      <div key={agent._id} className="flex items-center gap-2.5">
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{agent.assigneeName}</p>
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted/60">
                            <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(agent.overallProgress, 100)}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-bold tabular-nums text-red-500">{agent.overallProgress}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pending & Deadlines */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Approvals</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Approval queue</span>
                    </div>
                    <span className="text-sm font-bold">{pendingApprovalsCount}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <SplitSquareVertical className="h-3.5 w-3.5 text-blue-600" />
                      <span>Open distributions</span>
                    </div>
                    <span className="text-sm font-bold">{pendingActionsCount}</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deadlines</h4>
                {deadlineAlerts.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>No deadline alerts</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deadlineAlerts.slice(0, 5).map((agent) => (
                      <div key={agent._id} className="flex items-center gap-2.5">
                        <TimerReset className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{agent.assigneeName}</p>
                          <p className="text-[11px] text-muted-foreground">{resolveDeadlineAlert(agent)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TeamAllocationDialog
        open={showDistribute}
        onOpenChange={setShowDistribute}
        year={yearFilter}
        supervisorProfile={ownProfile}
        teamProfiles={teamProfiles}
        onSuccess={fetchTeam}
      />

      <AgentDetailDialog
        open={!!detailAgent}
        onOpenChange={(open) => { if (!open) setDetailAgent(null); }}
        agent={detailAgent}
        year={yearFilter}
      />
    </div>
  );
}
