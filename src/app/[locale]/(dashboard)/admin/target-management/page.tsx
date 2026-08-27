"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CompactProgress, RiskBadge, PerformanceBadge, KpiCard, TargetEmptyState,
  TargetTypeIcon, RankBadge, CompletionStage, getCompletionStage, IncentiveTierBadge,
} from "@/components/features/targets/TargetComponents";
import {
  Plus, Building2, Users, DollarSign, Crosshair, Sparkles, ArrowRight,
  CalendarDays, RotateCcw, Eye, Trash2, ChevronDown, ChevronRight,
  UsersRound, Activity, ShieldAlert, BarChart3, Download, Copy,
  TrendingUp, MapPin, Filter, MoreHorizontal, FileText, Award, SplitSquareVertical,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { formatCount } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EnrichedProfile {
  _id: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  assigneeRole: string;
  year: number;
  region?: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  currency: string;
  distributionStrategy: string;
  monthlyTargets: { month: number; employerTarget: number; employeeTarget: number; financeTarget: number }[];
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
  teamSize: number;
  status: string;
}

interface Totals {
  totalProfiles: number;
  supervisors: number;
  totalTeamSize: number;
  employer: { target: number; achieved: number };
  employee: { target: number; achieved: number };
  finance: { target: number; achieved: number };
  avgPerformance: number;
  riskBreakdown: { high: number; medium: number; low: number };
  regions: string[];
}

interface LeaderboardEntry {
  rank: number;
  _id: string;
  assigneeId: string;
  assigneeName: string;
  overallProgress: number;
  employerProgress: number;
  employeeProgress: number;
  financeProgress: number;
  riskScore: "high" | "medium" | "low";
  incentiveTier: "none" | "bronze" | "silver" | "gold" | "platinum";
}

interface UnderperformerEntry {
  _id: string;
  assigneeName: string;
  overallProgress: number;
  expectedProgress: number;
  gap: number;
  riskScore: "high" | "medium" | "low";
  incentiveTier: "none" | "bronze" | "silver" | "gold" | "platinum";
}

interface ReassignSupervisorOption {
  value: string;
  label: string;
  email: string;
  teamSize: number;
}

type TabView = "dashboard" | "leaderboard";

/* ------------------------------------------------------------------ */
/*  Admin Target Management Page                                       */
/* ------------------------------------------------------------------ */

export default function AdminTargetManagementPage() {
  const t = useTranslations("targets");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = pathname.split("/")[1] || "en";
  const {
    page, limit, total, totalPages,
    setPage, setLimit, updateTotal, resetPage, paginationParams,
  } = usePagination();
  const currentYear = new Date().getFullYear();
  const requestedYear = Number.parseInt(searchParams.get("year") ?? "", 10);
  const initialYearFilter = Number.isFinite(requestedYear) && requestedYear > 0
    ? requestedYear
    : currentYear;

  const [profiles, setProfiles] = useState<EnrichedProfile[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState(initialYearFilter);
  const [regionFilter, setRegionFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [completionFilter, setCompletionFilter] = useState<"all" | CompletionStage>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabView>("dashboard");
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [reassignAssigneeId, setReassignAssigneeId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignOptions, setReassignOptions] = useState<ReassignSupervisorOption[]>([]);
  const [reassignLoading, setReassignLoading] = useState(false);

  // Analytics
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [underperformers, setUnderperformers] = useState<UnderperformerEntry[]>([]);

  useEffect(() => {
    setYearFilter(initialYearFilter);
  }, [initialYearFilter]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      params.set("year", String(yearFilter));
      params.set("status", "active");
      if (regionFilter) params.set("region", regionFilter);
      if (riskFilter !== "all") params.set("risk", riskFilter);
      if (completionFilter !== "all") params.set("completion", completionFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const res = await fetch(`/api/admin/target-profiles?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles ?? []);
        setTotals(data.totals ?? null);
        updateTotal(data.pagination?.total ?? 0);
      }
    } catch {
      toast.error(t("failedToLoadProfiles"));
    } finally {
      setLoading(false);
    }
  }, [yearFilter, regionFilter, riskFilter, completionFilter, searchQuery, page, limit, paginationParams, updateTotal]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/target-profiles/analytics?year=${yearFilter}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? []);
        setUnderperformers(data.underperformers ?? []);
      }
    } catch { /* ignore */ }
  }, [yearFilter]);

  const fetchRegions = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/target-profiles/regions?year=${yearFilter}`);
      if (res.ok) {
        const data = await res.json();
        setRegionOptions(data.regions ?? []);
      }
    } catch { /* ignore */ }
  }, [yearFilter]);

  const fetchReassignOptions = useCallback(async () => {
    setReassignLoading(true);
    try {
      const params = new URLSearchParams({
        directory: "create-target",
        targetYear: String(yearFilter),
        availability: "available",
        limit: "500",
      });
      const res = await fetch(`/api/admin/super-agents?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReassignOptions((data.superAgents ?? []).map((item: {
          _id: string;
          name: string;
          email: string;
          directory?: { teamSize?: number };
        }) => ({
          value: item._id,
          label: item.name,
          email: item.email,
          teamSize: item.directory?.teamSize ?? 0,
        })));
      }
    } catch { /* ignore */ }
    finally { setReassignLoading(false); }
  }, [yearFilter]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);
  useEffect(() => {
    resetPage();
  }, [yearFilter, regionFilter, riskFilter, completionFilter, searchQuery, resetPage]);
  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);
  useEffect(() => { fetchRegions(); }, [fetchRegions]);
  useEffect(() => { fetchReassignOptions(); }, [fetchReassignOptions]);

  const filteredProfiles = profiles;

  // Actions
  const handleCancel = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/admin/target-profiles/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success(t("profileCancelled")); fetchProfiles(); }
      else { const err = await res.json(); toast.error(err.error ?? "Failed"); }
    } catch { toast.error(t("failedToCancel")); }
  };

  const handleClone = async () => {
    try {
      const res = await csrfFetch(`/api/admin/target-profiles?action=clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceYear: yearFilter - 1,
          targetYear: yearFilter,
          adjustmentPct: 10,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(t("profilesCloned", { count: data.cloned, year: yearFilter - 1 }));
        fetchProfiles();
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("failedToClone"));
      }
    } catch { toast.error(t("failedToClone")); }
  };

  const openReassign = (profileId: string) => {
    setReassigningId(profileId);
    setReassignAssigneeId("");
    setReassignReason("");
  };

  const closeReassign = () => {
    setReassigningId(null);
    setReassignAssigneeId("");
    setReassignReason("");
  };

  const handleReassign = async () => {
    if (!reassigningId || !reassignAssigneeId) return;

    try {
      const res = await csrfFetch(`/api/admin/target-profiles/${reassigningId}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newAssigneeId: reassignAssigneeId,
          reason: reassignReason.trim() || undefined,
        }),
      });

      if (res.ok) {
        toast.success(t("profileReassigned"));
        closeReassign();
        fetchProfiles();
        fetchAnalytics();
        fetchReassignOptions();
        return;
      }

      const err = await res.json();
      toast.error(err.error ?? t("failedToReassign"));
    } catch {
      toast.error(t("failedToReassign"));
    }
  };

  const handleExport = () => {
    const csvRows = [
      [t("csvHeaderSupervisor"), t("csvHeaderEmail"), t("csvHeaderRegion"), t("csvHeaderTeamSize"), t("csvHeaderCurrency"), t("csvHeaderEmployerTarget"), t("csvHeaderEmployerAchieved"), t("csvHeaderEmployeeTarget"), t("csvHeaderEmployeeAchieved"), t("csvHeaderFinanceTarget"), t("csvHeaderFinanceAchieved"), t("csvHeaderOverallPercent"), t("csvHeaderRisk")].join(","),
      ...filteredProfiles.map((r) =>
        [
          `"${r.assigneeName}"`, `"${r.assigneeEmail}"`, `"${r.region ?? ""}"`, r.teamSize,
          r.currency ?? "AED",
          r.employerTarget, r.employerAchieved,
          r.employeeTarget, r.employeeAchieved,
          r.financeTarget, r.financeAchieved,
          r.overallProgress, r.riskScore,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `target-profiles-${yearFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("csvExported"));
  };

  const reassignTarget = profiles.find((profile) => profile._id === reassigningId) ?? null;

  return (
    <div className="page-container">
      {/* The page heading is the shared hero, and it carries the totals. The two
          KPI card rows that used to sit between the toolbar and the table repeated
          these same six numbers and rendered 3-4 per row on a phone. */}
      <DashboardPageHeader
        compactOnMobile
        icon={Crosshair}
        title={t("title")}
        description={t("description")}
        metrics={[
          { label: t("supervisorCount"), value: totals?.supervisors ?? 0, note: t("totalAgentsNote", { count: totals?.totalTeamSize ?? 0 }), icon: UsersRound, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("employerLabel"), value: `${totals?.employer.achieved ?? 0}/${totals?.employer.target ?? 0}`, note: t("balanceNote", { value: formatCount(Math.max(0, (totals?.employer.target ?? 0) - (totals?.employer.achieved ?? 0))) }), icon: Building2, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("employeeLabel"), value: `${totals?.employee.achieved ?? 0}/${totals?.employee.target ?? 0}`, note: t("balanceNote", { value: formatCount(Math.max(0, (totals?.employee.target ?? 0) - (totals?.employee.achieved ?? 0))) }), icon: Users, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50" },
          { label: t("financeLabel"), value: `${formatCount(totals?.finance.achieved ?? 0)}/${formatCount(totals?.finance.target ?? 0)}`, note: t("balanceNote", { value: `${profiles[0]?.currency ?? "AED"} ${formatCount(Math.max(0, (totals?.finance.target ?? 0) - (totals?.finance.achieved ?? 0)))}` }), icon: DollarSign, iconClassName: "text-amber-600", iconSurfaceClassName: "bg-amber-50" },
          { label: t("avgPerformanceLabel"), value: `${totals?.avgPerformance ?? 0}%`, icon: Activity, iconClassName: "text-violet-600", iconSurfaceClassName: "bg-violet-50" },
          { label: t("activeProfilesLabel"), value: totals?.totalProfiles ?? 0, icon: BarChart3, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
        ]}
        footer={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("riskOverview")}</span>
            <span className="chip-pad rounded-full bg-status-rejected-bg text-xs font-semibold text-status-rejected">{t("riskHighCount", { count: totals?.riskBreakdown.high ?? 0 })}</span>
            <span className="chip-pad rounded-full bg-status-shortlisted-bg text-xs font-semibold text-status-shortlisted">{t("riskMediumCount", { count: totals?.riskBreakdown.medium ?? 0 })}</span>
            <span className="chip-pad rounded-full bg-status-selected-bg text-xs font-semibold text-status-selected">{t("riskLowCount", { count: totals?.riskBreakdown.low ?? 0 })}</span>
          </div>
        }
      />

      {/* Toolbar */}
      <TableToolbar
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t("searchSupervisors")}
        left={
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("enterpriseTargets")}
          </div>
        }
        actions={
          /* Three full labels do not fit a 390px row, so the two secondary
             actions go icon-only on phones (title carries the name) and the
             primary one keeps its label. Unchanged from `sm:` up. */
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Button variant="outline" size="sm" className="gap-1 rounded-lg px-2 sm:gap-2 sm:px-3" onClick={handleExport} disabled={profiles.length === 0} title={t("common.export")}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">{t("common.export")}</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1 rounded-lg px-2 sm:gap-2 sm:px-3" onClick={handleClone} title={t("cloneYear", { year: yearFilter - 1 })}>
              <Copy className="h-4 w-4" /> <span className="hidden sm:inline">{t("cloneYear", { year: yearFilter - 1 })}</span>
            </Button>
            <Link href={`/${locale}/admin/target-management/create`} className="min-w-0">
              <Button size="sm" className="gap-1 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 sm:gap-2 sm:px-4 sm:text-sm">
                <Plus className="h-4 w-4 shrink-0" /> {t("newTargetProfile")}
              </Button>
            </Link>
          </div>
        }
        filterContent={
          <div className="flex items-center gap-3">
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                value={yearFilter}
                onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)}
                className="h-11 w-32 rounded-xl border-border bg-card pl-9 text-sm"
                aria-label={t("a11yYear")}
              />
            </div>
            {regionOptions.length > 0 && (
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <SearchableSelect
                  options={[
                    { value: "", label: t("allRegions") },
                    ...regionOptions.map((region) => ({ value: region, label: region })),
                  ]}
                  value={regionFilter}
                  onValueChange={setRegionFilter}
                  placeholder={t("regionLabel")}
                  className="h-11 w-40 rounded-xl"
                />
              </div>
            )}
            <SearchableSelect
              options={[
                { value: "all", label: t("allStages") },
                { value: "not_started", label: t("notStarted") },
                { value: "in_progress", label: t("inProgress") },
                { value: "completed", label: t("completed") },
              ]}
              value={completionFilter}
              onValueChange={(value) => setCompletionFilter(value as "all" | CompletionStage)}
              placeholder={t("stageLabel")}
              className="h-11 w-40 rounded-xl"
            />
            <SearchableSelect
              options={[
                { value: "all", label: t("allRisk") },
                { value: "high", label: t("highRisk") },
                { value: "medium", label: t("mediumRisk") },
                { value: "low", label: t("lowRisk") },
              ]}
              value={riskFilter}
              onValueChange={(value) => setRiskFilter(value as "all" | "high" | "medium" | "low")}
              placeholder={t("riskLabel")}
              className="h-11 w-36 rounded-xl"
            />
            <Button variant="outline" size="sm" onClick={() => { setYearFilter(currentYear); setRegionFilter(""); setRiskFilter("all"); setCompletionFilter("all"); }} className="rounded-lg">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t("resetFilters")}
            </Button>
            <div className="ml-auto flex rounded-xl border border-border/60 bg-card p-0.5">
              <Button variant={tab === "dashboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("dashboard")} className="rounded-lg gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> {t("dashboardTab")}
              </Button>
              <Button variant={tab === "leaderboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("leaderboard")} className="rounded-lg gap-1.5">
                <Award className="h-3.5 w-3.5" /> {t("leaderboardTab")}
              </Button>
            </div>
          </div>
        }
        hasActiveFilters={yearFilter !== currentYear || !!regionFilter || riskFilter !== "all" || completionFilter !== "all"}
      />



      {/* ============= DASHBOARD TAB ============= */}
      {tab === "dashboard" && (
        <>
          {reassignTarget && (
            <section className="workspace-glass-panel card-pad rounded-2xl">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t("reassignTargetProfile")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("reassignHint", { name: reassignTarget.assigneeName, year: reassignTarget.year })}
                  </p>
                </div>
                <SearchableSelect
                  options={reassignOptions.map((option) => ({
                    value: option.value,
                    label: `${option.label} · ${option.teamSize} agents · ${option.email}`,
                  }))}
                  value={reassignAssigneeId}
                  onValueChange={setReassignAssigneeId}
                  placeholder={reassignLoading ? t("loadingSupervisors") : t("selectSupervisor")}
                  loading={reassignLoading}
                  className="h-11 min-w-64 rounded-xl"
                />
                <Input
                  value={reassignReason}
                  onChange={(event) => setReassignReason(event.target.value)}
                  placeholder={t("reasonLabel")}
                  className="h-11 rounded-xl lg:w-64"
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-11 rounded-lg" onClick={closeReassign}>{t("cancelButton")}</Button>
                  <Button size="sm" className="h-11 rounded-lg" onClick={handleReassign} disabled={!reassignAssigneeId}>{t("reassignButton")}</Button>
                </div>
              </div>
            </section>
          )}

          {/* Main Table */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("supervisorHeader")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("regionHeader")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("teamHeader")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {t("employerHeader")}</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {t("employeeHeader")}</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> {t("financeHeader")}</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("monthlyHeader")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("performanceHeader")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("riskHeader")}</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("actionsHeader")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-16 text-center">
                      <TargetEmptyState
                        title={t("noTargets")}
                        description={t("emptyStateTargetProfile")}
                        action={
                          <Link href={`/${locale}/admin/target-management/create`}>
                            <Button size="sm" className="mt-2 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                              <Plus className="h-4 w-4" /> {t("newTargetProfileButton")}
                            </Button>
                          </Link>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProfiles.map((row) => {
                    const isExpanded = expandedId === row._id;
                    return (
                      <TableRow
                        key={row._id}
                        className="group cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : row._id)}
                      >
                        <TableCell className="w-8 pr-0">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{row.assigneeName}</p>
                            <p className="text-xs text-muted-foreground">{row.assigneeEmail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.region ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                              <MapPin className="h-3 w-3" /> {row.region}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                            <UsersRound className="h-3 w-3" /> {row.teamSize}
                          </span>
                        </TableCell>
                        <TableCell>
                          <CompactProgress
                            achieved={row.employerAchieved}
                            target={row.employerTarget}
                            progress={row.employerProgress}
                            type="employer"
                          />
                        </TableCell>
                        <TableCell>
                          <CompactProgress
                            achieved={row.employeeAchieved}
                            target={row.employeeTarget}
                            progress={row.employeeProgress}
                            type="employee"
                          />
                        </TableCell>
                        <TableCell>
                          <CompactProgress
                            achieved={row.financeAchieved}
                            target={row.financeTarget}
                            progress={row.financeProgress}
                            type="finance"
                            currency={row.currency}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium tabular-nums">
                            {row.monthlyTargets.length}/12
                          </span>
                        </TableCell>
                        <TableCell>
                          <PerformanceBadge pct={row.overallProgress} />
                        </TableCell>
                        <TableCell>
                            <div className="flex flex-col items-start gap-1.5">
                              <RiskBadge risk={row.riskScore} />
                              <IncentiveTierBadge tier={row.incentiveTier ?? "none"} />
                            </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Link href={`/${locale}/admin/target-management/${row._id}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title={t("a11yViewDetails")}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title={t("a11yReassign")} onClick={() => openReassign(row._id)}>
                              <SplitSquareVertical className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10" title={t("a11yCancel")} onClick={() => handleCancel(row._id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />

          {/* Underperformance Alerts */}
          {underperformers.length > 0 && (
            <section className="space-y-3">
              <h3 className="heading-label flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                {t("underperformanceAlerts")}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {underperformers.slice(0, 6).map((u) => (
                  <div key={u._id} className="workspace-glass-panel card-pad flex items-center gap-3 rounded-xl border-l-4 border-red-500/40">
                    <div className="rounded-xl bg-red-500/10 p-2 text-red-600">
                      <TrendingUp className="h-4 w-4 rotate-180" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{u.assigneeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.overallProgress}% vs expected {u.expectedProgress}% ({u.gap}% gap)
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-1.5">
                      <RiskBadge risk={u.riskScore} />
                      <IncentiveTierBadge tier={u.incentiveTier ?? "none"} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ============= LEADERBOARD TAB ============= */}
      {tab === "leaderboard" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Rank</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Supervisor</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Overall</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Employer</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Employee</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Finance</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      <TargetEmptyState title={t("noLeaderboardData")} description={t("createProfilesToSeeRankings")} />
                    </TableCell>
                  </TableRow>
                ) : (
                  leaderboard.map((entry) => (
                    <TableRow key={entry._id} className={entry.rank <= 3 ? "bg-primary/[0.02]" : ""}>
                      <TableCell className="text-center">
                        <RankBadge rank={entry.rank} />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{entry.assigneeName}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <PerformanceBadge pct={entry.overallProgress} />
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-semibold tabular-nums ${entry.employerProgress >= 75 ? "text-emerald-600" : entry.employerProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {entry.employerProgress}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-semibold tabular-nums ${entry.employeeProgress >= 75 ? "text-emerald-600" : entry.employeeProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {entry.employeeProgress}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-semibold tabular-nums ${entry.financeProgress >= 75 ? "text-emerald-600" : entry.financeProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {entry.financeProgress}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <div className="flex flex-col items-start gap-1.5">
                            <RiskBadge risk={entry.riskScore} />
                            <IncentiveTierBadge tier={entry.incentiveTier ?? "none"} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
