"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid, SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";
import {
  Building2, Users, DollarSign, Crosshair, SplitSquareVertical,
  Plus, TrendingUp, CalendarDays, ChevronDown, ChevronRight,
  Eye, RotateCcw, Target, Trash2, AlertTriangle, CheckCircle2,
  Clock, Activity, ShieldAlert, Download, UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TargetItem {
  _id: string;
  type: "employer" | "employee" | "finance";
  year: number;
  month?: number;
  targetValue: number;
  achieved: number;
  progress: number;
  currency?: string;
  status: string;
}

interface TargetCell {
  _id: string;
  targetValue: number;
  achieved: number;
  progress: number;
  status: string;
  currency?: string;
  monthlyDistributed: number;
}

interface GroupedRow {
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  assigneeRole: string;
  employer: TargetCell | null;
  employee: TargetCell | null;
  finance: TargetCell | null;
  completionPct: number;
  pending: number;
  riskLevel: "high" | "medium" | "low";
}

interface Totals {
  totalTargets: number;
  agents: number;
  employer: { target: number; achieved: number };
  employee: { target: number; achieved: number };
  finance: { target: number; achieved: number };
  avgPerformance: number;
  riskBreakdown: { high: number; medium: number; low: number };
}

interface TargetSummary {
  employer: { yearly: TargetItem | null; monthly: TargetItem[] };
  employee: { yearly: TargetItem | null; monthly: TargetItem[] };
  finance: { yearly: TargetItem | null; monthly: TargetItem[] };
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  employer: <Building2 className="h-5 w-5" />,
  employee: <Users className="h-5 w-5" />,
  finance: <DollarSign className="h-5 w-5" />,
};
const TYPE_COLORS: Record<string, string> = {
  employer: "workspace-tone-sky",
  employee: "workspace-tone-emerald",
  finance: "workspace-tone-amber",
};
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function CompactProgress({ cell, type }: { cell: TargetCell | null; type: string }) {
  if (!cell) return <span className="text-xs text-muted-foreground italic">Not set</span>;
  const isFinance = type === "finance";
  const fmt = (v: number) => isFinance ? `${cell.currency ?? "AED"} ${v.toLocaleString()}` : v.toLocaleString();
  const color =
    cell.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
    cell.progress >= 40 ? "text-amber-600 dark:text-amber-400" :
    "text-red-500 dark:text-red-400";
  return (
    <div className="space-y-1 min-w-[110px]">
      <div className="flex items-baseline gap-1 tabular-nums">
        <span className="text-sm font-semibold">{fmt(cell.achieved)}</span>
        <span className="text-[11px] text-muted-foreground">/ {fmt(cell.targetValue)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={cell.progress} className="h-1.5 w-14" />
        <span className={`text-[11px] font-bold tabular-nums ${color}`}>{cell.progress}%</span>
      </div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: "high" | "medium" | "low" }) {
  if (risk === "high") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" /> High
    </span>
  );
  if (risk === "medium") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
      <Clock className="h-3 w-3" /> Med
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Low
    </span>
  );
}

function PerformanceBadge({ pct }: { pct: number }) {
  const color =
    pct >= 75 ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" :
    pct >= 40 ? "text-amber-600 dark:text-amber-400 bg-amber-500/10" :
    "text-red-600 dark:text-red-400 bg-red-500/10";
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-2 w-12" />
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${color}`}>{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentTargetsPage() {
  const t = useTranslations("targets");
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [yearFilter, setYearFilter] = useState(currentYear);
  const [tab, setTab] = useState<"own" | "team">("own");

  // Own targets
  const [ownTargets, setOwnTargets] = useState<TargetItem[]>([]);
  const [summary, setSummary] = useState<TargetSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Team (grouped)
  const [teamRows, setTeamRows] = useState<GroupedRow[]>([]);
  const [teamTotals, setTeamTotals] = useState<Totals | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create target
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [agents, setAgents] = useState<{ value: string; label: string }[]>([]);
  const [createForm, setCreateForm] = useState({ assigneeId: "", type: "employer" as "employer"|"employee"|"finance", targetValue: 0, currency: "AED" });

  // Distribute
  const [showDistribute, setShowDistribute] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distType, setDistType] = useState<"employer"|"employee"|"finance">("employer");
  const [distMonth, setDistMonth] = useState(currentMonth);
  const [allocations, setAllocations] = useState<{ agentUserId: string; value: number }[]>([]);

  const fetchOwnTargets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-agent/targets?year=${yearFilter}&view=own`);
      if (res.ok) { const data = await res.json(); setOwnTargets(data.targets ?? []); setSummary(data.summary ?? null); }
    } catch { toast.error("Failed to load targets"); }
    finally { setLoading(false); }
  }, [yearFilter]);

  const fetchTeamGrouped = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch(`/api/super-agent/targets/grouped?year=${yearFilter}&status=active`);
      if (res.ok) { const data = await res.json(); setTeamRows(data.rows ?? []); setTeamTotals(data.totals ?? null); }
    } catch { toast.error("Failed to load team targets"); }
    finally { setTeamLoading(false); }
  }, [yearFilter]);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/super-agent/agents?limit=100");
      if (res.ok) {
        const data = await res.json();
        setAgents((data.agents ?? data.items ?? []).map(
          (a: { userId?: string; _id?: string; name?: string; user?: { name?: string; _id?: string } }) => ({
            value: a.userId ?? a.user?._id ?? a._id ?? "",
            label: a.name ?? a.user?.name ?? "Unknown",
          })
        ));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchOwnTargets(); }, [fetchOwnTargets]);
  useEffect(() => { fetchTeamGrouped(); }, [fetchTeamGrouped]);
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleCreateTarget = async () => {
    if (!createForm.assigneeId || createForm.targetValue <= 0) { toast.error("Please fill all required fields"); return; }
    setCreating(true);
    try {
      const res = await csrfFetch("/api/super-agent/targets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: createForm.assigneeId, type: createForm.type, year: yearFilter, targetValue: createForm.targetValue, currency: createForm.currency }),
      });
      if (res.ok) { toast.success("Target assigned"); setShowCreate(false); setCreateForm({ assigneeId: "", type: "employer", targetValue: 0, currency: "AED" }); fetchTeamGrouped(); }
      else { const err = await res.json(); toast.error(err.error ?? "Failed"); }
    } catch { toast.error("Failed"); }
    finally { setCreating(false); }
  };

  const handleDistribute = async () => {
    if (allocations.length === 0) { toast.error("Add at least one allocation"); return; }
    setDistributing(true);
    try {
      const res = await csrfFetch("/api/super-agent/targets/distribute", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: distType, year: yearFilter, month: distMonth, allocations }),
      });
      if (res.ok) { toast.success("Distributed"); setShowDistribute(false); setAllocations([]); fetchTeamGrouped(); }
      else { const err = await res.json(); toast.error(err.error ?? "Failed"); }
    } catch { toast.error("Failed"); }
    finally { setDistributing(false); }
  };

  const handleCancelTarget = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/super-agent/targets/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Target cancelled"); fetchTeamGrouped(); }
    } catch { toast.error("Failed to cancel"); }
  };

  const handleExport = () => {
    const csvRows = [
      ["Agent","Email","Employer Target","Employer Achieved","Employee Target","Employee Achieved","Finance Target","Finance Achieved","Completion %","Risk"].join(","),
      ...teamRows.map((r) =>
        [r.assigneeName, r.assigneeEmail, r.employer?.targetValue ?? 0, r.employer?.achieved ?? 0, r.employee?.targetValue ?? 0, r.employee?.achieved ?? 0, r.finance?.targetValue ?? 0, r.finance?.achieved ?? 0, r.completionPct, r.riskLevel].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `team-targets-${yearFilter}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success("CSV exported");
  };

  const addAllocation = () => setAllocations((p) => [...p, { agentUserId: "", value: 0 }]);
  const formatValue = (type: string, val: number, currency?: string) => type === "finance" ? `${currency ?? "AED"} ${val.toLocaleString()}` : val.toLocaleString();
  const pct = (achieved: number, target: number) => target > 0 ? Math.round((achieved / target) * 100) : 0;

  // Own target metrics
  const metricsItems = (["employer","employee","finance"] as const).map((tType) => {
    const mt = ownTargets.find((item) => item.type === tType && item.month === currentMonth);
    return { label: t(`${tType}Target`), value: mt ? `${mt.achieved} / ${mt.targetValue}` : "—", helper: mt ? `${mt.progress}% ${t("achieved")}` : t("noTargetSet"), icon: TYPE_ICONS[tType], toneClassName: TYPE_COLORS[tType] };
  });
  const ownT = ownTargets.filter((i) => i.month === currentMonth).reduce((s, i) => s + i.targetValue, 0);
  const ownA = ownTargets.filter((i) => i.month === currentMonth).reduce((s, i) => s + i.achieved, 0);
  metricsItems.push({ label: t("overallProgress"), value: ownT > 0 ? `${Math.round((ownA / ownT) * 100)}%` : "—", helper: MONTHS_SHORT[currentMonth - 1] + ` ${yearFilter}`, icon: <TrendingUp className="h-5 w-5" />, toneClassName: "workspace-tone-violet" });

  return (
    <div className="space-y-6">
      <SuperAgentPageIntro title={t("title")} description={t("superAgentDescription")} eyebrow={t("eyebrow")} />

      {/* Year filter + tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)} className="h-11 w-28 rounded-xl border-border bg-card pl-9 text-sm" aria-label="Year" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setYearFilter(currentYear)} className="rounded-lg" disabled={yearFilter === currentYear}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
        </Button>
        <div className="flex rounded-xl border border-border/60 bg-card p-0.5">
          <Button variant={tab === "own" ? "default" : "ghost"} size="sm" onClick={() => setTab("own")} className="rounded-lg">{t("myTargets")}</Button>
          <Button variant={tab === "team" ? "default" : "ghost"} size="sm" onClick={() => setTab("team")} className="rounded-lg">{t("teamTargets")}</Button>
        </div>
        {tab === "team" && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg" onClick={handleExport} disabled={teamRows.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button size="sm" className="h-9 gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> {t("setTarget")}
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-2 rounded-lg" onClick={() => setShowDistribute(true)}>
              <SplitSquareVertical className="h-4 w-4" /> {t("distributeToAgents")}
            </Button>
          </div>
        )}
      </div>

      {/* ============ OWN TARGETS TAB ============ */}
      {tab === "own" && (
        <div className="space-y-4">
          <SuperAgentMetricsGrid items={metricsItems} />
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            (["employer","employee","finance"] as const).map((tType) => {
              const yearly = summary?.[tType]?.yearly;
              const monthlyList = summary?.[tType]?.monthly ?? [];
              if (!yearly && monthlyList.length === 0) return null;
              return (
                <SuperAgentSection key={tType} eyebrow={t(`${tType}Target`)}
                  title={yearly ? `${t("yearlyTarget")}: ${formatValue(tType, yearly.targetValue, yearly.currency)}` : t("monthlyTargetsOnly")}
                  description={yearly ? `${t("achieved")}: ${formatValue(tType, yearly.achieved, yearly.currency)} (${yearly.progress}%)` : undefined}>
                  {yearly && (<div className="mb-4 flex items-center gap-3"><Progress value={yearly.progress} className="h-3 flex-1" /><span className="text-sm font-medium">{yearly.progress}%</span></div>)}
                  {monthlyList.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                      {(monthlyList as TargetItem[]).map((m) => (
                        <div key={m._id} className="workspace-glass-panel rounded-xl p-3">
                          <p className="text-xs font-semibold text-muted-foreground">{MONTHS_SHORT[(m.month ?? 1) - 1]}</p>
                          <p className="mt-1 text-lg font-semibold tabular-nums text-primary">{m.achieved}/{m.targetValue}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={m.progress} className="h-2 flex-1" />
                            <span className={`text-xs font-semibold tabular-nums ${m.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" : m.progress >= 40 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{m.progress}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SuperAgentSection>
              );
            })
          )}
          {!loading && !summary?.employer?.yearly && !summary?.employee?.yearly && !summary?.finance?.yearly && (
            <div className="flex flex-col items-center gap-3 py-16"><Crosshair className="h-10 w-10 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">{t("noTargetsAssigned")}</p></div>
          )}
        </div>
      )}

      {/* ============ TEAM TARGETS TAB ============ */}
      {tab === "team" && (
        <div className="space-y-4">
          {/* Team KPIs — row 1 */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agents</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">{teamTotals?.agents ?? 0}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{teamTotals?.totalTargets ?? 0} active targets</p>
                </div>
                <div className="workspace-tone-sky rounded-2xl p-2.5"><UsersRound className="h-5 w-5" /></div>
              </div>
            </div>
            <div className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employer</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">{teamTotals?.employer.achieved ?? 0}<span className="text-lg text-muted-foreground">/{teamTotals?.employer.target ?? 0}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{pct(teamTotals?.employer.achieved ?? 0, teamTotals?.employer.target ?? 0)}% achieved</p>
                </div>
                <div className="workspace-tone-sky rounded-2xl p-2.5"><Building2 className="h-5 w-5" /></div>
              </div>
            </div>
            <div className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">{teamTotals?.employee.achieved ?? 0}<span className="text-lg text-muted-foreground">/{teamTotals?.employee.target ?? 0}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{pct(teamTotals?.employee.achieved ?? 0, teamTotals?.employee.target ?? 0)}% achieved</p>
                </div>
                <div className="workspace-tone-emerald rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
              </div>
            </div>
            <div className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Finance</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">{(teamTotals?.finance.achieved ?? 0).toLocaleString()}<span className="text-lg text-muted-foreground">/{(teamTotals?.finance.target ?? 0).toLocaleString()}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{pct(teamTotals?.finance.achieved ?? 0, teamTotals?.finance.target ?? 0)}% achieved</p>
                </div>
                <div className="workspace-tone-amber rounded-2xl p-2.5"><DollarSign className="h-5 w-5" /></div>
              </div>
            </div>
          </section>

          {/* Team KPIs — row 2 */}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="workspace-glass-panel flex items-center gap-4 rounded-2xl p-4">
              <div className="workspace-tone-violet rounded-2xl p-2.5"><Activity className="h-5 w-5" /></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg Completion</p><p className="text-2xl font-semibold tabular-nums text-primary">{teamTotals?.avgPerformance ?? 0}%</p></div>
            </div>
            <div className="workspace-glass-panel flex items-center gap-4 rounded-2xl p-4">
              <div className="rounded-2xl bg-red-500/10 p-2.5 text-red-600 dark:text-red-400"><ShieldAlert className="h-5 w-5" /></div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Risk Overview</p>
                <div className="mt-1 flex items-center gap-3 text-xs font-semibold">
                  <span className="text-red-600 dark:text-red-400">{teamTotals?.riskBreakdown.high ?? 0} High</span>
                  <span className="text-amber-600 dark:text-amber-400">{teamTotals?.riskBreakdown.medium ?? 0} Med</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{teamTotals?.riskBreakdown.low ?? 0} Low</span>
                </div>
              </div>
            </div>
            <div className="workspace-glass-panel flex items-center gap-4 rounded-2xl p-4">
              <div className="workspace-tone-sky rounded-2xl p-2.5"><Target className="h-5 w-5" /></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active Targets</p><p className="text-2xl font-semibold tabular-nums text-primary">{teamTotals?.totalTargets ?? 0}</p></div>
            </div>
          </section>

          {/* Team Table */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("agent")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Employer</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Employee</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    <div className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Finance</div>
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Completion</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Risk</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => (<TableCell key={j}><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>))}</TableRow>
                  ))
                ) : teamRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-2xl bg-muted/50 p-4"><Crosshair className="h-8 w-8 text-muted-foreground/40" /></div>
                        <p className="text-sm font-medium text-muted-foreground">{t("noAgentTargets")}</p>
                        <p className="text-xs text-muted-foreground">Assign targets to your agents to begin tracking</p>
                        <Button size="sm" onClick={() => setShowCreate(true)} className="mt-2 gap-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                          <Plus className="h-4 w-4" /> {t("setTarget")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  teamRows.map((row) => {
                    const isExpanded = expandedId === row.assigneeId;
                    return (
                      <Fragment key={row.assigneeId}>
                        <TableRow className="group cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : row.assigneeId)}>
                          <TableCell className="w-8 pr-0">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell>
                            <div><p className="font-medium">{row.assigneeName}</p><p className="text-xs text-muted-foreground">{row.assigneeEmail}</p></div>
                          </TableCell>
                          <TableCell><CompactProgress cell={row.employer} type="employer" /></TableCell>
                          <TableCell><CompactProgress cell={row.employee} type="employee" /></TableCell>
                          <TableCell><CompactProgress cell={row.finance} type="finance" /></TableCell>
                          <TableCell><PerformanceBadge pct={row.completionPct} /></TableCell>
                          <TableCell><RiskBadge risk={row.riskLevel} /></TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                              {(["employer","employee","finance"] as const).map((type) => {
                                const cell = row[type]; if (!cell) return null;
                                return (
                                  <Link key={type} href={`/${locale}/super-agent/targets/${cell._id}`}>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title={`View ${type}`}><Eye className="h-3.5 w-3.5" /></Button>
                                  </Link>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${row.assigneeId}-detail`} className="hover:bg-transparent">
                            <TableCell colSpan={8} className="bg-muted/20 px-6 py-5">
                              <div className="grid gap-3 sm:grid-cols-3">
                                {(["employer","employee","finance"] as const).map((type) => {
                                  const cell = row[type];
                                  const icon = type === "employer" ? <Building2 className="h-4 w-4" /> : type === "employee" ? <Users className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />;
                                  const tone = TYPE_COLORS[type];
                                  return (
                                    <div key={type} className="workspace-glass-panel rounded-xl p-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2"><div className={`${tone} rounded-lg p-1.5`}>{icon}</div><span className="text-sm font-semibold capitalize">{type}</span></div>
                                        {cell && <StatusBadge status={cell.status} />}
                                      </div>
                                      {cell ? (
                                        <div className="mt-3 space-y-2.5">
                                          <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target</p><p className="font-semibold tabular-nums">{type === "finance" ? `${cell.currency ?? "AED"} ${cell.targetValue.toLocaleString()}` : cell.targetValue.toLocaleString()}</p></div>
                                            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Achieved</p><p className="font-semibold tabular-nums text-primary">{cell.achieved.toLocaleString()}</p></div>
                                            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending</p><p className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{Math.max(0, cell.targetValue - cell.achieved).toLocaleString()}</p></div>
                                            <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly Split</p><p className="font-semibold tabular-nums">{cell.monthlyDistributed}/12</p></div>
                                          </div>
                                          <Progress value={cell.progress} className="h-2" />
                                          <div className="flex gap-1.5 pt-1">
                                            <Link href={`/${locale}/super-agent/targets/${cell._id}`}><Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs"><Eye className="h-3 w-3" /> Details</Button></Link>
                                            <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs text-destructive hover:bg-destructive/10" onClick={() => handleCancelTarget(cell._id)}><Trash2 className="h-3 w-3" /> Cancel</Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="mt-3 space-y-2">
                                          <p className="text-xs text-muted-foreground">No target assigned</p>
                                          <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs" onClick={() => { setCreateForm((p) => ({ ...p, assigneeId: row.assigneeId, type })); setShowCreate(true); }}>
                                            <Plus className="h-3 w-3" /> Set Target
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ---- Create Target Dialog ---- */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md overflow-visible">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><div className="workspace-tone-sky rounded-xl p-2"><Target className="h-4 w-4" /></div>{t("setTarget")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("agent")}</Label>
              <SearchableSelect options={agents} value={createForm.assigneeId} onValueChange={(v) => setCreateForm((p) => ({ ...p, assigneeId: v }))} placeholder={t("selectAgent")} className="h-11 rounded-xl border-border bg-card" modal />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("type")}</Label>
                <SearchableSelect options={[{ value: "employer", label: "Employer" },{ value: "employee", label: "Employee" },{ value: "finance", label: "Finance" }]} value={createForm.type} onValueChange={(v) => setCreateForm((p) => ({ ...p, type: v as typeof p.type }))} className="h-11 rounded-xl border-border bg-card" modal />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("targetValue")}</Label>
                <Input type="number" value={createForm.targetValue || ""} onChange={(e) => setCreateForm((p) => ({ ...p, targetValue: parseFloat(e.target.value) || 0 }))} placeholder={createForm.type === "finance" ? "e.g. 50000" : "e.g. 10"} className="h-11 rounded-xl border-border bg-card" />
              </div>
            </div>
            {createForm.type === "finance" && (
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("currency")}</Label>
                <Input value={createForm.currency} onChange={(e) => setCreateForm((p) => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) }))} maxLength={3} className="h-11 rounded-xl border-border bg-card" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowCreate(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreateTarget} disabled={creating} className="rounded-xl bg-sky-600 hover:bg-sky-700">{creating ? t("creating") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Distribute to Agents Dialog ---- */}
      <Dialog open={showDistribute} onOpenChange={setShowDistribute}>
        <DialogContent className="max-w-lg overflow-visible">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><div className="workspace-tone-amber rounded-xl p-2"><SplitSquareVertical className="h-4 w-4" /></div>{t("distributeToAgents")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5"><Label className="text-xs">{t("type")}</Label><SearchableSelect options={[{ value: "employer", label: "Employer" },{ value: "employee", label: "Employee" },{ value: "finance", label: "Finance" }]} value={distType} onValueChange={(v) => setDistType(v as typeof distType)} modal /></div>
              <div className="grid gap-1.5"><Label className="text-xs">{t("month")}</Label><SearchableSelect options={MONTHS_SHORT.map((m, i) => ({ value: String(i + 1), label: m }))} value={String(distMonth)} onValueChange={(v) => setDistMonth(parseInt(v))} modal /></div>
              <div className="grid gap-1.5"><Label className="text-xs">{t("year")}</Label><Input type="number" value={yearFilter} disabled className="h-9" /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label className="text-sm">{t("agentAllocations")}</Label><Button variant="outline" size="sm" onClick={addAllocation} className="gap-1"><Plus className="h-3 w-3" /> {t("addAgent")}</Button></div>
              {allocations.map((alloc, idx) => (
                <div key={idx} className="grid grid-cols-[1fr,100px] gap-2">
                  <SearchableSelect options={agents} value={alloc.agentUserId} onValueChange={(v) => { const c = [...allocations]; c[idx] = { ...c[idx], agentUserId: v }; setAllocations(c); }} placeholder={t("selectAgent")} modal />
                  <Input type="number" value={alloc.value || ""} onChange={(e) => { const c = [...allocations]; c[idx] = { ...c[idx], value: parseFloat(e.target.value) || 0 }; setAllocations(c); }} placeholder={t("value")} className="h-9" />
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-sm">{t("totalAllocated")}: <span className="font-bold tabular-nums">{allocations.reduce((s, a) => s + a.value, 0).toLocaleString()}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowDistribute(false)}>{t("cancel")}</Button>
            <Button onClick={handleDistribute} disabled={distributing} className="rounded-xl bg-sky-600 hover:bg-sky-700">{distributing ? t("distributing") : t("distribute")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
