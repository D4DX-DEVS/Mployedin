"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { RowActions } from "@/components/shared/RowActions";
import { SortableTableHeader, TableSortControl } from "@/components/shared/TableSortControl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CompactProgress, RiskBadge, PerformanceBadge, TargetEmptyState,
  RankBadge, CompletionStage, IncentiveTierBadge,
} from "@/components/features/targets/TargetComponents";
import {
  Plus, Building2, Users, DollarSign, Crosshair, CalendarDays, Eye, Trash2, UsersRound, Activity, ShieldAlert, BarChart3, Download, Copy, TrendingUp, MapPin, Award, SplitSquareVertical,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/hooks/useConfirm";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { TARGET_PROFILE_SORT_FIELDS, type TargetProfileSortField } from "@/lib/targets/profileSortFields";
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

const SORT_FIELDS: string[] = [...TARGET_PROFILE_SORT_FIELDS];

/* ------------------------------------------------------------------ */
/*  Admin Target Management Page                                       */
/* ------------------------------------------------------------------ */

export default function AdminTargetManagementPage() {
  const t = useTranslations("targets");
  const tc = useTranslations("common");
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
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
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "", { allow: SORT_FIELDS });
  const [sortOrder, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const order = sortOrder === "asc" ? "asc" : "desc";
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
      if (sortBy) params.set("sortBy", sortBy);
      params.set("sortOrder", order);
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
  }, [yearFilter, regionFilter, riskFilter, completionFilter, searchQuery, sortBy, order, page, limit, paginationParams, updateTotal]);

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

  // Same toggle as admin Interviews: a new column starts ascending, the active one flips.
  const toggleSort = (field: TargetProfileSortField) => {
    setSortBy(field);
    setSortOrder(sortBy === field && order === "asc" ? "desc" : "asc");
    resetPage();
  };
  // No sortBy = date added, the API's own order; the filter bar names it so the
  // direction button still has something to flip.
  const sortOptions = [
    { value: "dateAdded", label: t("sortDateAdded") },
    { value: "name", label: t("supervisorHeader") },
    { value: "teamSize", label: t("teamHeader") },
    { value: "employerProgress", label: t("employerHeader") },
    { value: "employeeProgress", label: t("employeeHeader") },
    { value: "financeProgress", label: t("financeHeader") },
    { value: "overallProgress", label: t("performanceHeader") },
    { value: "risk", label: t("riskHeader") },
  ];
  const sortHeader = (field: TargetProfileSortField, label: string) => (
    <SortableTableHeader label={label} active={sortBy === field} order={order} onClick={() => toggleSort(field)} />
  );

  // Actions
  const handleCancel = async (id: string) => {
    const ok = await confirmDialog({ message: t("cancelConfirm"), confirmLabel: t("cancelProfile") });
    if (!ok) return;
    try {
      const res = await csrfFetch(`/api/admin/target-profiles/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success(t("profileCancelled")); fetchProfiles(); }
      else { const err = await res.json(); toast.error(err.error ?? t("actionFailed")); }
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
      {ConfirmDialogNode}

      {/* The page heading is the shared hero, and it carries the totals. The two
          KPI card rows that used to sit between the toolbar and the table repeated
          these same six numbers and rendered 3-4 per row on a phone. */}
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={Crosshair}
        title={t("title")}
        description={t("description")}
        metrics={[
          { label: t("supervisorCount"), value: totals?.supervisors ?? 0, note: t("totalAgentsNote", { count: totals?.totalTeamSize ?? 0 }), icon: UsersRound, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("employerMetric"), value: `${formatCount(totals?.employer.achieved ?? 0)} / ${formatCount(totals?.employer.target ?? 0)}`, note: t("balanceNote", { value: formatCount(Math.max(0, (totals?.employer.target ?? 0) - (totals?.employer.achieved ?? 0))) }), icon: Building2, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("employeeMetric"), value: `${formatCount(totals?.employee.achieved ?? 0)} / ${formatCount(totals?.employee.target ?? 0)}`, note: t("balanceNote", { value: formatCount(Math.max(0, (totals?.employee.target ?? 0) - (totals?.employee.achieved ?? 0))) }), icon: Users, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50" },
          { label: t("financeMetric"), value: `${formatCount(totals?.finance.achieved ?? 0)} / ${formatCount(totals?.finance.target ?? 0)}`, note: t("balanceNote", { value: `${profiles[0]?.currency ?? "AED"} ${formatCount(Math.max(0, (totals?.finance.target ?? 0) - (totals?.finance.achieved ?? 0)))}` }), icon: DollarSign, iconClassName: "text-amber-600", iconSurfaceClassName: "bg-amber-50" },
          { label: t("avgAchievementMetric"), value: `${totals?.avgPerformance ?? 0}%`, icon: Activity, iconClassName: "text-violet-600", iconSurfaceClassName: "bg-violet-50" },
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
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={yearFilter !== currentYear || !!regionFilter || riskFilter !== "all" || completionFilter !== "all" ? () => { setYearFilter(currentYear); setRegionFilter(""); setRiskFilter("all"); setCompletionFilter("all"); } : undefined}
        clearLabel={t("resetFilters")}
        moreLabel={t("advancedFilters")}
        more={(
          <>
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
              className={INLINE_FILTER_CONTROL}
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
              className={INLINE_FILTER_CONTROL}
            />
          </>
        )}
      >
        <InlineFilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t("searchSupervisors")}
        />
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
        <TableSortControl
          value={sortBy || "dateAdded"}
          onValueChange={(v) => { setSortBy(v === "dateAdded" ? "" : v); resetPage(); }}
          options={sortOptions}
          order={order}
          onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
          compact
        />
      </InlineFilterBar>

      {/* View switch on the left, page actions on the right. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <div className="flex rounded-xl border border-border/60 bg-card p-0.5">
          <Button variant={tab === "dashboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("dashboard")} className="rounded-lg gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> {t("dashboardTab")}
          </Button>
          <Button variant={tab === "leaderboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("leaderboard")} className="rounded-lg gap-1.5">
            <Award className="h-3.5 w-3.5" /> {t("leaderboardTab")}
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 ms-auto">
          <Button variant="outline" size="sm" className="gap-1 rounded-lg px-2 sm:gap-2 sm:px-3" onClick={handleExport} disabled={profiles.length === 0} title={tc("export")}>
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">{tc("export")}</span>
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
      </div>



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
          {/* Region rides in the Supervisor cell (the Region filter and search
              still cover it) so the nine columns fit the panel at desktop widths;
              narrower screens scroll inside the panel, never the page. */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <Table className="sm:[&_td]:px-3 sm:[&_th]:px-3">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{sortHeader("name", t("supervisorHeader"))}</TableHead>
                  <TableHead className="text-center">{sortHeader("teamSize", t("teamHeader"))}</TableHead>
                  <TableHead>{sortHeader("employerProgress", t("employerHeader"))}</TableHead>
                  <TableHead>{sortHeader("employeeProgress", t("employeeHeader"))}</TableHead>
                  <TableHead>{sortHeader("financeProgress", t("financeHeader"))}</TableHead>
                  <TableHead>{t("monthlyHeader")}</TableHead>
                  <TableHead>{sortHeader("overallProgress", t("performanceHeader"))}</TableHead>
                  <TableHead>{sortHeader("risk", t("riskHeader"))}</TableHead>
                  <TableHead className="text-end">{t("actionsHeader")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-16 text-center">
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
                  filteredProfiles.map((row) => (
                      <TableRow key={row._id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium">{row.assigneeName}</p>
                            {/* Long addresses wrap (after the @ first) rather than widen the table. */}
                            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                              {row.assigneeEmail.includes("@") ? (
                                <>{row.assigneeEmail.slice(0, row.assigneeEmail.indexOf("@") + 1)}<wbr />{row.assigneeEmail.slice(row.assigneeEmail.indexOf("@") + 1)}</>
                              ) : row.assigneeEmail}
                            </p>
                            {row.region && (
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                <MapPin className="h-3 w-3" aria-hidden="true" /> {row.region}
                              </span>
                            )}
                          </div>
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
                            className="min-w-0"
                          />
                        </TableCell>
                        <TableCell>
                          <CompactProgress
                            achieved={row.employeeAchieved}
                            target={row.employeeTarget}
                            progress={row.employeeProgress}
                            type="employee"
                            className="min-w-0"
                          />
                        </TableCell>
                        <TableCell>
                          <CompactProgress
                            achieved={row.financeAchieved}
                            target={row.financeTarget}
                            progress={row.financeProgress}
                            type="finance"
                            currency={row.currency}
                            className="min-w-0"
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
                        <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            name={row.assigneeName}
                            labelsFrom="wide"
                            quick={[{ key: "view", label: t("a11yViewDetails"), icon: Eye, href: `/${locale}/admin/target-management/${row._id}` }]}
                            menu={[
                              { key: "reassign", label: t("a11yReassign"), icon: SplitSquareVertical, onSelect: () => openReassign(row._id) },
                              { key: "cancel", label: t("a11yCancel"), icon: Trash2, onSelect: () => handleCancel(row._id), destructive: true },
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
                  <TableHead className="w-16 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("rank")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("supervisor")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("overall")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("employer")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("employee")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("finance")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("risk")}</TableHead>
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
