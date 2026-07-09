"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { TableToolbar } from "@/components/shared/TableToolbar";
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
      let url = `/api/admin/target-profiles?year=${yearFilter}&status=active`;
      if (regionFilter) url += `&region=${encodeURIComponent(regionFilter)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles ?? []);
        setTotals(data.totals ?? null);
      }
    } catch {
      toast.error(t("failedToLoadProfiles"));
    } finally {
      setLoading(false);
    }
  }, [yearFilter, regionFilter]);

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
  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);
  useEffect(() => { fetchRegions(); }, [fetchRegions]);
  useEffect(() => { fetchReassignOptions(); }, [fetchReassignOptions]);

  // Filter by search
  const filteredProfiles = profiles.filter((p) => {
    if (riskFilter !== "all" && p.riskScore !== riskFilter) return false;
    if (completionFilter !== "all" && getCompletionStage(p.overallProgress) !== completionFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.assigneeName.toLowerCase().includes(q) ||
      p.assigneeEmail.toLowerCase().includes(q) ||
      (p.region ?? "").toLowerCase().includes(q);
  });

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
      ["Supervisor", "Email", "Region", "Team Size", "Currency", "Employer Target", "Employer Achieved", "Employee Target", "Employee Achieved", "Finance Target", "Finance Achieved", "Overall %", "Risk"].join(","),
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

  const pct = (a: number, tgt: number) => tgt > 0 ? Math.round((a / tgt) * 100) : 0;
  const reassignTarget = profiles.find((profile) => profile._id === reassigningId) ?? null;

  return (
    <div className="page-container space-y-6">
      {/* Toolbar */}
      <TableToolbar
        title={t("title")}
        description={t("description")}
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t("searchSupervisors")}
        left={
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("enterpriseTargets")}
          </div>
        }
        right={
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
            {totals?.supervisors ?? 0} supervisors · {totals?.totalTeamSize ?? 0} agents · {totals?.totalProfiles ?? 0} profiles
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg" onClick={handleExport} disabled={profiles.length === 0}>
              <Download className="h-4 w-4" /> {t("common.export")}
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg" onClick={handleClone}>
              <Copy className="h-4 w-4" /> {t("cloneYear", { year: yearFilter - 1 })}
            </Button>
            <Link href={`/${locale}/admin/target-management/create`}>
              <Button className="h-9 gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> {t("newTargetProfile")}
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
                    { value: "", label: "All Regions" },
                    ...regionOptions.map((region) => ({ value: region, label: region })),
                  ]}
                  value={regionFilter}
                  onValueChange={setRegionFilter}
                  placeholder="Region"
                  className="h-11 w-40 rounded-xl"
                />
              </div>
            )}
            <SearchableSelect
              options={[
                { value: "all", label: "All stages" },
                { value: "not_started", label: "Not started" },
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
              ]}
              value={completionFilter}
              onValueChange={(value) => setCompletionFilter(value as "all" | CompletionStage)}
              placeholder="Stage"
              className="h-11 w-40 rounded-xl"
            />
            <SearchableSelect
              options={[
                { value: "all", label: "All risk" },
                { value: "high", label: "High risk" },
                { value: "medium", label: "Medium risk" },
                { value: "low", label: "Low risk" },
              ]}
              value={riskFilter}
              onValueChange={(value) => setRiskFilter(value as "all" | "high" | "medium" | "low")}
              placeholder="Risk"
              className="h-11 w-36 rounded-xl"
            />
            <Button variant="outline" size="sm" onClick={() => { setYearFilter(currentYear); setRegionFilter(""); setRiskFilter("all"); setCompletionFilter("all"); }} className="rounded-lg">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
            <div className="ml-auto flex rounded-xl border border-border/60 bg-card p-0.5">
              <Button variant={tab === "dashboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("dashboard")} className="rounded-lg gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Dashboard
              </Button>
              <Button variant={tab === "leaderboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("leaderboard")} className="rounded-lg gap-1.5">
                <Award className="h-3.5 w-3.5" /> Leaderboard
              </Button>
            </div>
          </div>
        }
        hasActiveFilters={yearFilter !== currentYear || !!regionFilter || riskFilter !== "all" || completionFilter !== "all"}
      />

      {/* KPI Summary Row 1 */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Supervisors"
          value={totals?.supervisors ?? 0}
          subtext={`${totals?.totalTeamSize ?? 0} total agents`}
          icon={<UsersRound className="h-5 w-5" />}
          toneClassName="workspace-tone-sky"
        />
        <KpiCard
          label="Employer"
          value={<>{totals?.employer.achieved ?? 0}<span className="text-lg text-muted-foreground">/{totals?.employer.target ?? 0}</span></>}
          subtext={`Assigned ${totals?.employer.target ?? 0} · Balance ${Math.max(0, (totals?.employer.target ?? 0) - (totals?.employer.achieved ?? 0))}`}
          icon={<Building2 className="h-5 w-5" />}
          toneClassName="workspace-tone-sky"
        />
        <KpiCard
          label="Employee"
          value={<>{totals?.employee.achieved ?? 0}<span className="text-lg text-muted-foreground">/{totals?.employee.target ?? 0}</span></>}
          subtext={`Assigned ${totals?.employee.target ?? 0} · Balance ${Math.max(0, (totals?.employee.target ?? 0) - (totals?.employee.achieved ?? 0))}`}
          icon={<Users className="h-5 w-5" />}
          toneClassName="workspace-tone-emerald"
        />
        <KpiCard
          label="Finance"
          value={<>{(totals?.finance.achieved ?? 0).toLocaleString()}<span className="text-lg text-muted-foreground">/{(totals?.finance.target ?? 0).toLocaleString()}</span></>}
          subtext={`Assigned ${(profiles[0]?.currency ?? "AED")} ${(totals?.finance.target ?? 0).toLocaleString()} · Balance ${(profiles[0]?.currency ?? "AED")} ${Math.max(0, (totals?.finance.target ?? 0) - (totals?.finance.achieved ?? 0)).toLocaleString()}`}
          icon={<DollarSign className="h-5 w-5" />}
          toneClassName="workspace-tone-amber"
        />
      </section>

      {/* KPI Summary Row 2 */}
      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Avg Performance"
          value={`${totals?.avgPerformance ?? 0}%`}
          icon={<Activity className="h-5 w-5" />}
          toneClassName="workspace-tone-violet"
        />
        <div className="workspace-glass-panel flex items-center gap-4 rounded-2xl p-4">
          <div className="rounded-2xl bg-red-500/10 p-2.5 text-red-600 dark:text-red-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Risk Overview</p>
            <div className="mt-1 flex items-center gap-3 text-xs font-semibold">
              <span className="text-red-600 dark:text-red-400">{totals?.riskBreakdown.high ?? 0} High</span>
              <span className="text-amber-600 dark:text-amber-400">{totals?.riskBreakdown.medium ?? 0} Med</span>
              <span className="text-emerald-600 dark:text-emerald-400">{totals?.riskBreakdown.low ?? 0} Low</span>
            </div>
          </div>
        </div>
        <KpiCard
          label="Active Profiles"
          value={totals?.totalProfiles ?? 0}
          icon={<BarChart3 className="h-5 w-5" />}
          toneClassName="workspace-tone-sky"
        />
      </section>

      {/* ============= DASHBOARD TAB ============= */}
      {tab === "dashboard" && (
        <>
          {reassignTarget && (
            <section className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Reassign target profile</p>
                  <p className="text-xs text-muted-foreground">
                    Move {reassignTarget.assigneeName}'s {reassignTarget.year} target to another available supervisor.
                  </p>
                </div>
                <SearchableSelect
                  options={reassignOptions.map((option) => ({
                    value: option.value,
                    label: `${option.label} · ${option.teamSize} agents · ${option.email}`,
                  }))}
                  value={reassignAssigneeId}
                  onValueChange={setReassignAssigneeId}
                  placeholder={reassignLoading ? "Loading supervisors" : "Select supervisor"}
                  loading={reassignLoading}
                  className="h-11 min-w-64 rounded-xl"
                />
                <Input
                  value={reassignReason}
                  onChange={(event) => setReassignReason(event.target.value)}
                  placeholder="Reason"
                  className="h-11 rounded-xl lg:w-64"
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-11 rounded-lg" onClick={closeReassign}>Cancel</Button>
                  <Button size="sm" className="h-11 rounded-lg" onClick={handleReassign} disabled={!reassignAssigneeId}>Reassign</Button>
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
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Supervisor</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Region</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Team</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Employer</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Employee</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Finance</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Monthly</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Performance</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Risk</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Actions</TableHead>
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
                        description="Create unified target profiles for your supervisors to begin annual planning"
                        action={
                          <Link href={`/${locale}/admin/target-management/create`}>
                            <Button size="sm" className="mt-2 gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                              <Plus className="h-4 w-4" /> New Target Profile
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

          {/* Underperformance Alerts */}
          {underperformers.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                Underperformance Alerts
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {underperformers.slice(0, 6).map((u) => (
                  <div key={u._id} className="workspace-glass-panel flex items-center gap-3 rounded-xl p-3 border-l-4 border-red-500/40">
                    <div className="rounded-xl bg-red-500/10 p-2 text-red-600 dark:text-red-400">
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
