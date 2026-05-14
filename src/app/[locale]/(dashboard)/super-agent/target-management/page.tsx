"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
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
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  Building2, Users, DollarSign, SplitSquareVertical,
  TrendingUp, CalendarDays, RotateCcw, Download,
  Search, AlertCircle, CheckCircle2,
  ClipboardList, TimerReset, Target, Info, MapPin,
  Eye, SlidersHorizontal, CircleDollarSign,
} from "lucide-react";

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

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  return `${currency} ${value.toLocaleString()}`;
}

function getProgressColor(progress: number): string {
  if (progress >= 75) return "bg-emerald-500";
  if (progress >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function getProgressTextColor(progress: number): string {
  if (progress >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (progress >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function formatShortDate(value?: string): string {
  if (!value) return "No update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No update";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function getTerritory(agent: EnrichedProfile): string {
  return agent.territory ?? agent.region ?? "Unassigned";
}

function getRiskReason(agent: EnrichedProfile): string {
  const metrics = [
    { label: "Employer", progress: agent.employerProgress },
    { label: "Employee", progress: agent.employeeProgress },
    { label: "Revenue", progress: agent.financeProgress },
  ].sort((a, b) => a.progress - b.progress);

  return `${metrics[0].label} at ${metrics[0].progress}%`;
}

function getNextAction(agent: EnrichedProfile): string {
  const metrics = [
    { label: "Add employers", progress: agent.employerProgress },
    { label: "Close placements", progress: agent.employeeProgress },
    { label: "Push revenue", progress: agent.financeProgress },
  ].sort((a, b) => a.progress - b.progress);

  if (getCompletionStage(agent.overallProgress) === "completed") return "Maintain pace";
  return metrics[0].label;
}

function getDeadlineAlert(agent: EnrichedProfile): string {
  const currentMonth = new Date().getMonth() + 1;
  const currentMonthData = agent.monthlyAchievements.find((month) => month.month === currentMonth);
  if (!currentMonthData) return "Annual target";
  if (currentMonthData.overallProgress >= 75) return `${MONTHS_SHORT[currentMonth - 1]} on track`;
  if (currentMonthData.overallProgress > 0) return `${MONTHS_SHORT[currentMonth - 1]} behind pace`;
  return `${MONTHS_SHORT[currentMonth - 1]} not started`;
}

function getDistributionStatus(agent: EnrichedProfile): string {
  if (getCompletionStage(agent.overallProgress) === "completed") return "Completed";
  if (agent.employerTarget + agent.employeeTarget + agent.financeTarget > 0) return "Distributed";
  return "Not distributed";
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
    <div className="workspace-glass-panel rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <div className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p>
        </div>
        <div className={`${METRIC_TONE_CLASS_MAP[tone]} rounded-xl p-2`}>{icon}</div>
      </div>
      {typeof progress === "number" ? (
        <div className="mt-4 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
            <div className={`h-full rounded-full ${getProgressColor(progress)}`} style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          <span className={`min-w-10 text-right text-xs font-bold tabular-nums ${getProgressTextColor(progress)}`}>{progress}%</span>
        </div>
      ) : null}
    </div>
  );
}

function SideListCard({ title, actionLabel, onAction, children }: SideListCardProps) {
  return (
    <aside className="workspace-glass-panel rounded-xl p-4">
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
  const requestedYear = Number.parseInt(searchParams.get("year") ?? "", 10);
  const initialYearFilter = Number.isFinite(requestedYear) && requestedYear > 0
    ? requestedYear
    : currentYear;

  const [yearFilter, setYearFilter] = useState(initialYearFilter);
  const [tab, setTab] = useState<"own" | "team" | "analytics">("team");
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);

  // Own profile
  const [ownProfile, setOwnProfile] = useState<EnrichedProfile | null>(null);

  // Team
  const [teamProfiles, setTeamProfiles] = useState<EnrichedProfile[]>([]);
  const [analytics, setAnalytics] = useState<SuperAgentTargetAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamRiskFilter, setTeamRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [teamCompletionFilter, setTeamCompletionFilter] = useState<"all" | CompletionStage>("all");
  const [teamTerritoryFilter, setTeamTerritoryFilter] = useState("all");

  // Distribute dialog
  const [showDistribute, setShowDistribute] = useState(false);

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
    } catch { toast.error("Failed to load targets"); }
    finally { setLoading(false); }
  }, [yearFilter]);

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch(`/api/super-agent/target-profiles?year=${yearFilter}&view=team`);
      if (res.ok) {
        const data = await res.json();
        setTeamProfiles(data.profiles ?? []);
      }
    } catch { toast.error("Failed to load team targets"); }
    finally { setTeamLoading(false); }
  }, [yearFilter]);

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

  const filteredTeamProfiles = useMemo(() => {
    return teamProfiles.filter((agent) => {
      if (teamTerritoryFilter !== "all" && getTerritory(agent) !== teamTerritoryFilter) return false;
      if (teamRiskFilter !== "all" && agent.riskScore !== teamRiskFilter) return false;
      if (teamCompletionFilter !== "all" && getCompletionStage(agent.overallProgress) !== teamCompletionFilter) return false;
      if (!teamSearch.trim()) return true;
      const q = teamSearch.trim().toLowerCase();
      return agent.assigneeName.toLowerCase().includes(q) || agent.assigneeEmail.toLowerCase().includes(q) || getTerritory(agent).toLowerCase().includes(q);
    });
  }, [teamCompletionFilter, teamProfiles, teamRiskFilter, teamSearch, teamTerritoryFilter]);

  const territoryOptions = useMemo(() => {
    const territories = [...new Set(teamProfiles.map(getTerritory))].filter(Boolean).sort();
    return [
      { value: "all", label: "All territories" },
      ...territories.map((territory) => ({ value: territory, label: territory })),
    ];
  }, [teamProfiles]);

  const currencyLabel = useMemo(() => {
    const currencies = [...new Set(teamProfiles.map((agent) => agent.regionalCurrency ?? agent.currency ?? "AED"))];
    return currencies.length === 1 ? currencies[0] : `${currencies.length} currencies`;
  }, [teamProfiles]);

  const filteredStageCounts = useMemo(() => {
    return filteredTeamProfiles.reduce(
      (counts, agent) => {
        counts[getCompletionStage(agent.overallProgress)] += 1;
        return counts;
      },
      { not_started: 0, in_progress: 0, completed: 0 } as Record<CompletionStage, number>
    );
  }, [filteredTeamProfiles]);

  const filteredTotals = useMemo(() => {
    return {
      agents: filteredTeamProfiles.length,
      employer: {
        target: filteredTeamProfiles.reduce((sum, agent) => sum + agent.employerTarget, 0),
        achieved: filteredTeamProfiles.reduce((sum, agent) => sum + agent.employerAchieved, 0),
      },
      employee: {
        target: filteredTeamProfiles.reduce((sum, agent) => sum + agent.employeeTarget, 0),
        achieved: filteredTeamProfiles.reduce((sum, agent) => sum + agent.employeeAchieved, 0),
      },
      finance: {
        target: filteredTeamProfiles.reduce((sum, agent) => sum + agent.financeTarget, 0),
        achieved: filteredTeamProfiles.reduce((sum, agent) => sum + agent.financeAchieved, 0),
      },
      avgPerformance: filteredTeamProfiles.length > 0
        ? Math.round(filteredTeamProfiles.reduce((sum, agent) => sum + agent.overallProgress, 0) / filteredTeamProfiles.length)
        : 0,
      riskHigh: filteredTeamProfiles.filter((agent) => agent.riskScore === "high").length,
    };
  }, [filteredTeamProfiles]);

  const attentionItems = useMemo(() => {
    const highRisk = filteredTeamProfiles.filter((agent) => agent.riskScore === "high").length;
    const behindEmployer = filteredTeamProfiles.filter((agent) => agent.employerProgress < 40).length;
    const behindEmployee = filteredTeamProfiles.filter((agent) => agent.employeeProgress < 40).length;
    const behindFinance = filteredTeamProfiles.filter((agent) => agent.financeProgress < 40).length;

    return [
      { label: `${behindEmployer} agents are behind on employer target`, tone: "bg-red-500" },
      { label: `${behindEmployee} agents are behind on employee target`, tone: "bg-amber-500" },
      { label: `${behindFinance} agents are behind on revenue target`, tone: "bg-amber-500" },
      { label: `${highRisk} agents are marked high risk`, tone: "bg-red-500" },
    ];
  }, [filteredTeamProfiles]);

  const topPerformers = useMemo(() => {
    return [...filteredTeamProfiles].sort((a, b) => b.overallProgress - a.overallProgress).slice(0, 3);
  }, [filteredTeamProfiles]);

  const underPerformers = useMemo(() => {
    return [...filteredTeamProfiles].sort((a, b) => a.overallProgress - b.overallProgress).slice(0, 3);
  }, [filteredTeamProfiles]);

  const pendingActionsCount = useMemo(() => {
    return filteredTeamProfiles.filter((agent) => getCompletionStage(agent.overallProgress) !== "completed").length;
  }, [filteredTeamProfiles]);

  const pendingApprovalsCount = useMemo(() => {
    return filteredTeamProfiles.filter((agent) => agent.status !== "active" && getCompletionStage(agent.overallProgress) !== "completed").length;
  }, [filteredTeamProfiles]);

  const deadlineAlerts = useMemo(() => {
    return filteredTeamProfiles.filter((agent) => getDeadlineAlert(agent).includes("behind") || getDeadlineAlert(agent).includes("not started"));
  }, [filteredTeamProfiles]);

  const handleExport = () => {
    const csvRows = [
      ["Agent","Email","Territory","Currency","Employer Target","Employer Achieved","Employee Target","Employee Achieved","Finance Target","Finance Achieved","Overall %","Stage","Risk","Next Action","Last Update"].join(","),
      ...filteredTeamProfiles.map((r) =>
        [`"${r.assigneeName}"`, `"${r.assigneeEmail}"`, `"${getTerritory(r)}"`, r.currency ?? "AED", r.employerTarget, r.employerAchieved, r.employeeTarget, r.employeeAchieved, r.financeTarget, r.financeAchieved, r.overallProgress, getCompletionStage(r.overallProgress), r.riskScore, `"${getNextAction(r)}"`, `"${formatShortDate(r.lastActivityAt ?? r.updatedAt)}"`].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `team-targets-${yearFilter}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success("CSV exported");
  };

  const pct = (a: number, tgt: number) => tgt > 0 ? Math.round((a / tgt) * 100) : 0;
  const hasActiveDashboardFilters = yearFilter !== currentYear || teamSearch.trim().length > 0 || teamTerritoryFilter !== "all" || teamCompletionFilter !== "all" || teamRiskFilter !== "all";

  const handleResetDashboard = () => {
    setYearFilter(currentYear);
    setTeamSearch("");
    setTeamTerritoryFilter("all");
    setTeamCompletionFilter("all");
    setTeamRiskFilter("all");
  };

  return (
    <div className="page-container space-y-4">
      <section className="workspace-panel-surface rounded-2xl px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Target className="h-3.5 w-3.5" />
              {t("eyebrow")}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t("title")}</h1>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Target flow">
                      <Info className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs leading-5">
                    Admin assigns yearly target. You split it to agents, then track assigned, achieved, and balance.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t("superAgentDescription")}</p>
          </div>
          <Badge variant="outline" className="rounded-full px-3 py-1.5">
            <CircleDollarSign className="mr-1.5 h-3.5 w-3.5" /> {currencyLabel}
          </Badge>
        </div>
      </section>

      <div className="sticky top-0 z-20 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)} className="h-10 w-28 rounded-xl border-border bg-background pl-9 text-sm" />
          </div>
          <Button variant="outline" size="sm" onClick={handleResetDashboard} className="h-10 rounded-xl" disabled={!hasActiveDashboardFilters}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          <div className="flex rounded-xl border border-border/60 bg-background p-0.5">
            <Button variant={tab === "own" ? "default" : "ghost"} size="sm" onClick={() => setTab("own")} className="h-9 flex-1 rounded-lg px-3">Mine</Button>
            <Button variant={tab === "team" ? "default" : "ghost"} size="sm" onClick={() => setTab("team")} className="h-9 flex-1 rounded-lg px-3">Team</Button>
            <Button variant={tab === "analytics" ? "default" : "ghost"} size="sm" onClick={() => setTab("analytics")} className="h-9 flex-1 rounded-lg px-3">Analytics</Button>
          </div>
          {tab === "team" ? (
            <>
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder="Search agents, email, territory"
                  className="h-10 rounded-xl border-border bg-background pl-9 text-sm"
                />
              </div>
              <SearchableSelect
                options={territoryOptions}
                value={teamTerritoryFilter}
                onValueChange={setTeamTerritoryFilter}
                placeholder="Territory"
                className="h-10 w-40 rounded-xl"
              />
              <SearchableSelect
                options={[
                  { value: "all", label: "All stages" },
                  { value: "not_started", label: "Not started" },
                  { value: "in_progress", label: "In progress" },
                  { value: "completed", label: "Completed" },
                ]}
                value={teamCompletionFilter}
                onValueChange={(value) => setTeamCompletionFilter(value as "all" | CompletionStage)}
                placeholder="Stage"
                className="h-10 w-36 rounded-xl"
              />
              <SearchableSelect
                options={[
                  { value: "all", label: "All risk" },
                  { value: "high", label: "High risk" },
                  { value: "medium", label: "Medium risk" },
                  { value: "low", label: "Low risk" },
                ]}
                value={teamRiskFilter}
                onValueChange={(value) => setTeamRiskFilter(value as "all" | "high" | "medium" | "low")}
                placeholder="Risk"
                className="h-10 w-32 rounded-xl"
              />
              <Button variant="outline" size="sm" className="h-10 gap-2 rounded-xl" onClick={handleExport} disabled={filteredTeamProfiles.length === 0}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </>
          ) : null}
          <Button className="h-10 gap-2 rounded-xl bg-blue-700 px-4 text-white hover:bg-blue-800" onClick={() => setShowDistribute(true)}>
            <SplitSquareVertical className="h-4 w-4" /> Distribute
          </Button>
        </div>
      </div>

      {tab === "team" && (
        <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <DashboardMetricCard
            label="Team completion"
            value={`${filteredTotals.avgPerformance}%`}
            helper={`${filteredStageCounts.in_progress} active · ${filteredStageCounts.completed} completed`}
            icon={<TrendingUp className="h-5 w-5" />}
            progress={filteredTotals.avgPerformance}
            tone="blue"
          />
          <DashboardMetricCard
            label="Employer target"
            value={<>{filteredTotals.employer.achieved}<span className="text-base text-muted-foreground"> / {filteredTotals.employer.target}</span></>}
            helper={`${Math.max(0, filteredTotals.employer.target - filteredTotals.employer.achieved)} balance`}
            icon={<Building2 className="h-5 w-5" />}
            progress={pct(filteredTotals.employer.achieved, filteredTotals.employer.target)}
            tone="green"
          />
          <DashboardMetricCard
            label="Employee target"
            value={<>{filteredTotals.employee.achieved}<span className="text-base text-muted-foreground"> / {filteredTotals.employee.target}</span></>}
            helper={`${Math.max(0, filteredTotals.employee.target - filteredTotals.employee.achieved)} balance`}
            icon={<Users className="h-5 w-5" />}
            progress={pct(filteredTotals.employee.achieved, filteredTotals.employee.target)}
            tone="violet"
          />
          <DashboardMetricCard
            label="Revenue target"
            value={formatCompactCurrency(filteredTotals.finance.achieved, ownProfile?.currency ?? "AED")}
            helper={`${formatCompactCurrency(filteredTotals.finance.target, ownProfile?.currency ?? "AED")} assigned`}
            icon={<DollarSign className="h-5 w-5" />}
            progress={pct(filteredTotals.finance.achieved, filteredTotals.finance.target)}
            tone="amber"
          />
          <DashboardMetricCard
            label="At risk"
            value={filteredTotals.riskHigh}
            helper="Agents need attention"
            icon={<AlertCircle className="h-5 w-5" />}
            tone="red"
          />
          <DashboardMetricCard
            label="Pending actions"
            value={pendingActionsCount}
            helper="Agents still not completed"
            icon={<ClipboardList className="h-5 w-5" />}
            tone="blue"
          />
        </section>

        </>
      )}

      {/* ============ OWN TAB ============ */}
      {tab === "own" && (
        <div className="space-y-6">
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
                    <p className="text-sm font-semibold">Execution Status</p>
                    <p className="text-xs text-muted-foreground">Quick view of what is completed, active, and still pending.</p>
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : analytics ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardMetricCard
                  label="Team agents"
                  value={analytics.teamSummary.totalAgents}
                  helper="Agents with target profiles"
                  icon={<Users className="h-5 w-5" />}
                  tone="blue"
                />
                <DashboardMetricCard
                  label="Avg performance"
                  value={`${analytics.teamSummary.avgPerformance}%`}
                  helper="Across distributed agent profiles"
                  icon={<TrendingUp className="h-5 w-5" />}
                  progress={analytics.teamSummary.avgPerformance}
                  tone="green"
                />
                <DashboardMetricCard
                  label="High risk"
                  value={analytics.teamSummary.highRiskCount}
                  helper="Agents needing action"
                  icon={<AlertCircle className="h-5 w-5" />}
                  tone="red"
                />
                <DashboardMetricCard
                  label="Platinum"
                  value={analytics.teamSummary.incentiveBreakdown.platinum}
                  helper="Agents at or above 100%"
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  tone="violet"
                />
              </div>

              <SuperAgentSection eyebrow="Rankings" title="Team performance leaderboard">
                <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Rank</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Agent</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Progress</TableHead>
                        <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Risk</TableHead>
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
            <TargetEmptyState title="No monthly analytics yet" description="Monthly distribution will appear after this yearly target is split by month." />
          ) : (
            <SuperAgentSection eyebrow={t("monthlyBreakdown")} title={t("monthlyBreakdownDescription")}>
              <MonthlyDistributionGrid months={ownProfile.monthlyAchievements} currency={ownProfile.currency} />
            </SuperAgentSection>
          )}
        </div>
      )}

      {/* ============ TEAM TAB ============ */}
      {tab === "team" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* Agent table */}
          <div className="min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm overflow-x-auto">
            <Table className="min-w-[1280px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Agent</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Territory</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Employer</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Employee</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Finance</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Performance</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Stage</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Risk</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Update</TableHead>
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
                        description="Distribute your targets to agents using the button above"
                        action={
                          <Button size="sm" onClick={() => setShowDistribute(true)} className="mt-2 gap-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                            <SplitSquareVertical className="h-4 w-4" /> Distribute
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : filteredTeamProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-16 text-center">
                      <TargetEmptyState
                        title="No agents match these filters"
                        description="Try a different search, risk level, or completion stage."
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
                            Clear filters
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTeamProfiles.map((agent) => (
                    <TableRow key={agent._id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{agent.assigneeName}</p>
                          <p className="text-xs text-muted-foreground">{agent.assigneeEmail}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="info" className="px-2 py-0.5 text-[10px]">{getDistributionStatus(agent)}</Badge>
                            <span className="text-[11px] text-muted-foreground">{getDeadlineAlert(agent)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {getTerritory(agent)}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{agent.regionalCurrency ?? agent.currency}</p>
                      </TableCell>
                      <TableCell>
                        <CompactProgress achieved={agent.employerAchieved} target={agent.employerTarget} progress={agent.employerProgress} type="employer" />
                      </TableCell>
                      <TableCell>
                        <CompactProgress achieved={agent.employeeAchieved} target={agent.employeeTarget} progress={agent.employeeProgress} type="employee" />
                      </TableCell>
                      <TableCell>
                        <CompactProgress achieved={agent.financeAchieved} target={agent.financeTarget} progress={agent.financeProgress} type="finance" currency={agent.currency} />
                      </TableCell>
                      <TableCell>
                        <PerformanceBadge pct={agent.overallProgress} />
                      </TableCell>
                      <TableCell>
                        <CompletionBadge stage={getCompletionStage(agent.overallProgress)} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <RiskBadge risk={agent.riskScore} />
                          <IncentiveTierBadge tier={agent.incentiveTier ?? "none"} />
                          <p className="text-[11px] text-muted-foreground">{getRiskReason(agent)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-foreground">{formatShortDate(agent.lastActivityAt ?? agent.updatedAt ?? agent.createdAt)}</p>
                        <p className="text-[11px] text-muted-foreground">{getNextAction(agent)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                  aria-label={`Focus ${agent.assigneeName}`}
                                  onClick={() => setTeamSearch(agent.assigneeName)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Focus this agent</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
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

          <div className="space-y-3">
            <SideListCard title="Attention required">
              {attentionItems.map((item) => (
                <div key={item.label} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.tone}`} />
                  <span>{item.label}</span>
                </div>
              ))}
            </SideListCard>

            <SideListCard title="Top performers">
              {topPerformers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No team target data yet.</p>
              ) : topPerformers.map((agent, index) => (
                <div key={agent._id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-600">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{agent.assigneeName}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/60">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(agent.overallProgress, 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-emerald-600">{agent.overallProgress}%</span>
                </div>
              ))}
            </SideListCard>

            <SideListCard title="Under performers">
              {underPerformers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No team target data yet.</p>
              ) : underPerformers.map((agent) => (
                <div key={agent._id} className="flex items-center gap-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{agent.assigneeName}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/60">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(agent.overallProgress, 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-red-500">{agent.overallProgress}%</span>
                </div>
              ))}
            </SideListCard>

            <SideListCard title="Pending approvals">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Target approval queue</span>
                </div>
                <span className="text-sm font-bold tabular-nums text-foreground">{pendingApprovalsCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <SplitSquareVertical className="h-4 w-4 text-blue-600" />
                  <span>Open distributions</span>
                </div>
                <span className="text-sm font-bold tabular-nums text-foreground">{pendingActionsCount}</span>
              </div>
            </SideListCard>

            <SideListCard title="Deadlines">
              {deadlineAlerts.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>No monthly deadline alerts</span>
                </div>
              ) : deadlineAlerts.slice(0, 3).map((agent) => (
                <div key={agent._id} className="flex items-center gap-3">
                  <TimerReset className="h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{agent.assigneeName}</p>
                    <p className="text-[11px] text-muted-foreground">{getDeadlineAlert(agent)}</p>
                  </div>
                </div>
              ))}
            </SideListCard>
          </div>
        </div>
      )}

      <TeamAllocationDialog
        open={showDistribute}
        onOpenChange={setShowDistribute}
        year={yearFilter}
        supervisorProfile={ownProfile}
        teamProfiles={teamProfiles}
        onSuccess={fetchTeam}
      />
    </div>
  );
}
