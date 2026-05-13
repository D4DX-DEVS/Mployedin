"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, Building2, Users, DollarSign, Crosshair,
  ChevronDown, ChevronRight, Sparkles, ArrowRight, Target, TrendingUp,
  CalendarDays, RotateCcw, SplitSquareVertical, Eye, Trash2,
  AlertTriangle, CheckCircle2, Clock, UsersRound, Activity,
  ShieldAlert, BarChart3, Download, Copy,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  teamSize: number;
  employer: TargetCell | null;
  employee: TargetCell | null;
  finance: TargetCell | null;
  performancePct: number;
  pending: number;
  riskScore: "high" | "medium" | "low";
  distributionStatus: "full" | "partial" | "none";
}

interface Totals {
  totalTargets: number;
  supervisors: number;
  totalTeamSize: number;
  employer: { target: number; achieved: number };
  employee: { target: number; achieved: number };
  finance: { target: number; achieved: number };
  avgPerformance: number;
  riskBreakdown: { high: number; medium: number; low: number };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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
    <div className="space-y-1 min-w-[120px]">
      <div className="flex items-baseline gap-1 tabular-nums">
        <span className="text-sm font-semibold">{fmt(cell.achieved)}</span>
        <span className="text-[11px] text-muted-foreground">/ {fmt(cell.targetValue)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={cell.progress} className="h-1.5 w-16" />
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
      <Clock className="h-3 w-3" /> Medium
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Low
    </span>
  );
}

function DistributionBadge({ status }: { status: "full" | "partial" | "none" }) {
  if (status === "full") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> Distributed
    </span>
  );
  if (status === "partial") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
      <Clock className="h-3 w-3" /> Partial
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      <Clock className="h-3 w-3" /> None
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
      <Progress value={pct} className="h-2 w-14" />
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${color}`}>{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminTargetsPage() {
  const t = useTranslations("targets");
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const currentYear = new Date().getFullYear();

  const [rows, setRows] = useState<GroupedRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create target
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [superAgents, setSuperAgents] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState({
    assigneeId: "",
    type: "employer" as "employer" | "employee" | "finance",
    year: currentYear,
    targetValue: 0,
    currency: "AED",
    notes: "",
  });

  // Distribute dialog
  const [showDistribute, setShowDistribute] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distributeTargetId, setDistributeTargetId] = useState("");
  const [distributeInfo, setDistributeInfo] = useState<{ name: string; type: string; value: number } | null>(null);
  const [distributeValues, setDistributeValues] = useState<number[]>(Array(12).fill(0));

  const fetchGrouped = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/targets/grouped?year=${yearFilter}&status=active`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
        setTotals(data.totals ?? null);
      }
    } catch {
      toast.error("Failed to load targets");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  const fetchSuperAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/super-agents?limit=100");
      if (res.ok) {
        const data = await res.json();
        const list = (data.superAgents ?? data.items ?? []).map(
          (sa: { userId?: string; _id?: string; name?: string; user?: { name?: string; _id?: string } }) => ({
            value: sa.userId ?? sa.user?._id ?? sa._id ?? "",
            label: sa.name ?? sa.user?.name ?? "Unknown",
          })
        );
        setSuperAgents(list);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchGrouped(); }, [fetchGrouped]);
  useEffect(() => { fetchSuperAgents(); }, [fetchSuperAgents]);

  /* --- Actions --- */
  const handleCreate = async () => {
    if (!form.assigneeId || form.targetValue <= 0) {
      toast.error("Please fill all required fields");
      return;
    }
    setCreating(true);
    try {
      const res = await csrfFetch("/api/admin/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, assigneeRole: "super_agent" }),
      });
      if (res.ok) {
        toast.success("Target created successfully");
        setShowCreate(false);
        setForm({ assigneeId: "", type: "employer", year: currentYear, targetValue: 0, currency: "AED", notes: "" });
        fetchGrouped();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to create target");
      }
    } catch {
      toast.error("Failed to create target");
    } finally {
      setCreating(false);
    }
  };

  const openDistribute = (row: GroupedRow, type: "employer" | "employee" | "finance") => {
    const cell = row[type];
    if (!cell) return;
    setDistributeTargetId(cell._id);
    setDistributeInfo({ name: row.assigneeName, type, value: cell.targetValue });
    const perMonth = Math.floor(cell.targetValue / 12);
    const remainder = cell.targetValue - perMonth * 12;
    setDistributeValues(Array.from({ length: 12 }, (_, i) => perMonth + (i < remainder ? 1 : 0)));
    setShowDistribute(true);
  };

  const handleDistribute = async () => {
    setDistributing(true);
    try {
      const monthlyValues = distributeValues.map((v, i) => ({ month: i + 1, value: v }));
      const res = await csrfFetch("/api/admin/targets/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: distributeTargetId, monthlyValues }),
      });
      if (res.ok) {
        toast.success("Target distributed into monthly targets");
        setShowDistribute(false);
        fetchGrouped();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to distribute");
      }
    } catch {
      toast.error("Failed to distribute");
    } finally {
      setDistributing(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/admin/targets/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Target cancelled");
        fetchGrouped();
      }
    } catch {
      toast.error("Failed to cancel");
    }
  };

  const handleExport = () => {
    const csvRows = [
      ["Super Agent", "Email", "Team Size", "Employer Target", "Employer Achieved", "Employee Target", "Employee Achieved", "Finance Target", "Finance Achieved", "Performance %", "Risk"].join(","),
      ...rows.map((r) =>
        [
          r.assigneeName, r.assigneeEmail, r.teamSize,
          r.employer?.targetValue ?? 0, r.employer?.achieved ?? 0,
          r.employee?.targetValue ?? 0, r.employee?.achieved ?? 0,
          r.finance?.targetValue ?? 0, r.finance?.achieved ?? 0,
          r.performancePct, r.riskScore,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `targets-${yearFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const distributeSum = distributeValues.reduce((a, b) => a + b, 0);
  const pct = (achieved: number, target: number) => target > 0 ? Math.round((achieved / target) * 100) : 0;

  return (
    <div className="page-container space-y-6">
      {/* Toolbar */}
      <TableToolbar
        title={t("title")}
        description={t("description")}
        search=""
        onSearchChange={() => {}}
        searchPlaceholder="Search supervisors…"
        left={
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            HQ Operations
          </div>
        }
        right={
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
            {totals?.supervisors ?? 0} supervisors · {totals?.totalTeamSize ?? 0} agents · {totals?.totalTargets ?? 0} targets
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg" onClick={handleExport} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              onClick={() => setShowCreate(true)}
              className="h-9 gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              {t("setTarget")}
            </Button>
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
                aria-label="Year"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setYearFilter(currentYear)} className="rounded-lg" disabled={yearFilter === currentYear}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        }
        hasActiveFilters={yearFilter !== currentYear}
      />

      {/* KPI Summary — 2 rows */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Supervisors</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">{totals?.supervisors ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">{totals?.totalTeamSize ?? 0} total agents</p>
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5"><UsersRound className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employer</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">
                {totals?.employer.achieved ?? 0}<span className="text-lg text-muted-foreground">/{totals?.employer.target ?? 0}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{pct(totals?.employer.achieved ?? 0, totals?.employer.target ?? 0)}% achieved</p>
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5"><Building2 className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">
                {totals?.employee.achieved ?? 0}<span className="text-lg text-muted-foreground">/{totals?.employee.target ?? 0}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{pct(totals?.employee.achieved ?? 0, totals?.employee.target ?? 0)}% achieved</p>
            </div>
            <div className="workspace-tone-emerald rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Finance</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">
                {(totals?.finance.achieved ?? 0).toLocaleString()}<span className="text-lg text-muted-foreground">/{(totals?.finance.target ?? 0).toLocaleString()}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{pct(totals?.finance.achieved ?? 0, totals?.finance.target ?? 0)}% achieved</p>
            </div>
            <div className="workspace-tone-amber rounded-2xl p-2.5"><DollarSign className="h-5 w-5" /></div>
          </div>
        </div>
      </section>

      {/* Secondary KPIs */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="workspace-glass-panel flex items-center gap-4 rounded-2xl p-4">
          <div className="workspace-tone-violet rounded-2xl p-2.5"><Activity className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg Performance</p>
            <p className="text-2xl font-semibold tabular-nums text-primary">{totals?.avgPerformance ?? 0}%</p>
          </div>
        </div>
        <div className="workspace-glass-panel flex items-center gap-4 rounded-2xl p-4">
          <div className="rounded-2xl bg-red-500/10 p-2.5 text-red-600 dark:text-red-400"><ShieldAlert className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Risk Overview</p>
            <div className="mt-1 flex items-center gap-3 text-xs font-semibold">
              <span className="text-red-600 dark:text-red-400">{totals?.riskBreakdown.high ?? 0} High</span>
              <span className="text-amber-600 dark:text-amber-400">{totals?.riskBreakdown.medium ?? 0} Med</span>
              <span className="text-emerald-600 dark:text-emerald-400">{totals?.riskBreakdown.low ?? 0} Low</span>
            </div>
          </div>
        </div>
        <div className="workspace-glass-panel flex items-center gap-4 rounded-2xl p-4">
          <div className="workspace-tone-sky rounded-2xl p-2.5"><BarChart3 className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active Targets</p>
            <p className="text-2xl font-semibold tabular-nums text-primary">{totals?.totalTargets ?? 0}</p>
          </div>
        </div>
      </section>

      {/* ===================== MAIN TABLE ===================== */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8" />
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Super Agent</TableHead>
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
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-2xl bg-muted/50 p-4"><Crosshair className="h-8 w-8 text-muted-foreground/40" /></div>
                    <p className="text-sm font-medium text-muted-foreground">{t("noTargets")}</p>
                    <p className="text-xs text-muted-foreground">Assign annual targets to your supervisors to begin planning</p>
                    <Button size="sm" onClick={() => setShowCreate(true)} className="mt-2 gap-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                      <Plus className="h-4 w-4" /> {t("setTarget")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const isExpanded = expandedId === row.assigneeId;
                return (
                  <>
                    <TableRow
                      key={row.assigneeId}
                      className="group cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : row.assigneeId)}
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
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                          <UsersRound className="h-3 w-3" /> {row.teamSize}
                        </span>
                      </TableCell>
                      <TableCell><CompactProgress cell={row.employer} type="employer" /></TableCell>
                      <TableCell><CompactProgress cell={row.employee} type="employee" /></TableCell>
                      <TableCell><CompactProgress cell={row.finance} type="finance" /></TableCell>
                      <TableCell><DistributionBadge status={row.distributionStatus} /></TableCell>
                      <TableCell><PerformanceBadge pct={row.performancePct} /></TableCell>
                      <TableCell><RiskBadge risk={row.riskScore} /></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          {(["employer", "employee", "finance"] as const).map((type) => {
                            const cell = row[type];
                            if (!cell) return null;
                            return (
                              <Link key={type} href={`/${locale}/admin/targets/${cell._id}`}>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title={`View ${type} details`}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded row — detail cards */}
                    {isExpanded && (
                      <TableRow key={`${row.assigneeId}-detail`} className="hover:bg-transparent">
                        <TableCell colSpan={10} className="bg-muted/20 px-6 py-5">
                          <div className="grid gap-3 sm:grid-cols-3">
                            {(["employer", "employee", "finance"] as const).map((type) => {
                              const cell = row[type];
                              const icon = type === "employer" ? <Building2 className="h-4 w-4" />
                                : type === "employee" ? <Users className="h-4 w-4" />
                                : <DollarSign className="h-4 w-4" />;
                              const tone = type === "employer" ? "workspace-tone-sky"
                                : type === "employee" ? "workspace-tone-emerald"
                                : "workspace-tone-amber";

                              return (
                                <div key={type} className="workspace-glass-panel rounded-xl p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={`${tone} rounded-lg p-1.5`}>{icon}</div>
                                      <span className="text-sm font-semibold capitalize">{type}</span>
                                    </div>
                                    {cell && <StatusBadge status={cell.status} />}
                                  </div>
                                  {cell ? (
                                    <div className="mt-3 space-y-2.5">
                                      <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target</p>
                                          <p className="font-semibold tabular-nums">
                                            {type === "finance" ? `${cell.currency ?? "AED"} ${cell.targetValue.toLocaleString()}` : cell.targetValue.toLocaleString()}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Achieved</p>
                                          <p className="font-semibold tabular-nums text-primary">{cell.achieved.toLocaleString()}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending</p>
                                          <p className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{Math.max(0, cell.targetValue - cell.achieved).toLocaleString()}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly Split</p>
                                          <p className="font-semibold tabular-nums">{cell.monthlyDistributed}/12</p>
                                        </div>
                                      </div>
                                      <Progress value={cell.progress} className="h-2" />
                                      <div className="flex flex-wrap gap-1.5 pt-1">
                                        <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs" onClick={() => openDistribute(row, type)}>
                                          <SplitSquareVertical className="h-3 w-3" /> Auto Monthly Split
                                        </Button>
                                        <Link href={`/${locale}/admin/targets/${cell._id}`}>
                                          <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs">
                                            <Eye className="h-3 w-3" /> View Team Breakdown
                                          </Button>
                                        </Link>
                                        <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs text-destructive hover:bg-destructive/10" onClick={() => handleCancel(cell._id)}>
                                          <Trash2 className="h-3 w-3" /> Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-3 space-y-2">
                                      <p className="text-xs text-muted-foreground">No target assigned for {yearFilter}</p>
                                      <Button size="sm" variant="outline" className="h-7 gap-1 rounded-lg text-xs"
                                        onClick={() => { setForm((p) => ({ ...p, assigneeId: row.assigneeId, type, year: yearFilter })); setShowCreate(true); }}>
                                        <Plus className="h-3 w-3" /> Set Annual Target
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
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ---- Create Target Dialog ---- */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md overflow-visible">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="workspace-tone-sky rounded-xl p-2"><Target className="h-4 w-4" /></div>
              Set Annual Target
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Super Agent</Label>
              <SearchableSelect
                options={superAgents}
                value={form.assigneeId}
                onValueChange={(v) => setForm((p) => ({ ...p, assigneeId: v }))}
                placeholder={t("selectSuperAgent")}
                className="h-11 rounded-xl border-border bg-card"
                modal
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("type")}</Label>
                <SearchableSelect
                  options={[
                    { value: "employer", label: "Employer" },
                    { value: "employee", label: "Employee" },
                    { value: "finance", label: "Finance" },
                  ]}
                  value={form.type}
                  onValueChange={(v) => setForm((p) => ({ ...p, type: v as typeof p.type }))}
                  className="h-11 rounded-xl border-border bg-card"
                  modal
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("year")}</Label>
                <Input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((p) => ({ ...p, year: parseInt(e.target.value) || currentYear }))}
                  className="h-11 rounded-xl border-border bg-card"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Annual Target Value</Label>
              <Input
                type="number"
                value={form.targetValue || ""}
                onChange={(e) => setForm((p) => ({ ...p, targetValue: parseFloat(e.target.value) || 0 }))}
                placeholder={form.type === "finance" ? "e.g. 500000" : "e.g. 100"}
                className="h-11 rounded-xl border-border bg-card"
              />
            </div>
            {form.type === "finance" && (
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("currency")}</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) }))}
                  maxLength={3}
                  className="h-11 rounded-xl border-border bg-card"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("notes")}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder={t("optionalNotes")}
                className="h-11 rounded-xl border-border bg-card"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowCreate(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreate} disabled={creating} className="rounded-xl bg-sky-600 hover:bg-sky-700">
              {creating ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Auto Monthly Split Dialog ---- */}
      <Dialog open={showDistribute} onOpenChange={setShowDistribute}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="workspace-tone-amber rounded-xl p-2"><SplitSquareVertical className="h-4 w-4" /></div>
              Auto Monthly Split
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {distributeInfo && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  {distributeInfo.type === "employer" ? <Building2 className="h-4 w-4" />
                    : distributeInfo.type === "employee" ? <Users className="h-4 w-4" />
                    : <DollarSign className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{distributeInfo.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{distributeInfo.type} · {yearFilter} · Annual: {distributeInfo.value.toLocaleString()}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {MONTHS.map((m, i) => (
                <div key={m} className="grid gap-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m}</Label>
                  <Input
                    type="number"
                    value={distributeValues[i] || ""}
                    onChange={(e) => { const vals = [...distributeValues]; vals[i] = parseFloat(e.target.value) || 0; setDistributeValues(vals); }}
                    className="h-9 rounded-lg text-sm tabular-nums"
                  />
                </div>
              ))}
            </div>
            <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${
              distributeInfo && distributeSum !== distributeInfo.value ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"
            }`}>
              <span className="font-medium">Total distributed:</span>
              <span className="font-bold tabular-nums">{distributeSum.toLocaleString()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowDistribute(false)}>{t("cancel")}</Button>
            <Button onClick={handleDistribute} disabled={distributing} className="rounded-xl bg-sky-600 hover:bg-sky-700">
              {distributing ? t("distributing") : t("distribute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
