"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PerformanceBadge } from "@/components/features/targets/TargetComponents";
import { csrfFetch } from "@/lib/security/csrf-client";
import { generateMonthlyDistribution } from "@/lib/targets/distributionStrategies";
import {
  Building2,
  DollarSign,
  Search,
  SplitSquareVertical,
  Target,
  Users,
  Weight,
  WandSparkles,
  X,
  RotateCcw,
  ArrowDownAZ,
  TrendingUp,
  Filter,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AllocationMode = "equal" | "weighted" | "manual";
type RiskScore = "high" | "medium" | "low";

interface MonthlyTarget {
  month: number;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
}

interface SupervisorProfile {
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  currency: string;
}

interface TeamProfile {
  _id: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
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
  riskScore: RiskScore;
  monthlyAchievements: Array<{
    month: number;
    employerTarget: number;
    employeeTarget: number;
    financeTarget: number;
  }>;
}

interface AgentDirectoryItem {
  _id: string;
  name: string;
  email: string;
  leadsCount: number;
  conversions: number;
  conversionRate: number;
  avgResponseHours: number;
}

interface AllocationRow {
  agentUserId: string;
  agentName: string;
  agentEmail: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  weight: number;
  monthlyTargets: MonthlyTarget[];
  performancePct: number;
  riskScore: RiskScore;
  hasExistingProfile: boolean;
}

interface TeamAllocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  supervisorProfile: SupervisorProfile | null;
  teamProfiles: TeamProfile[];
  onSuccess: () => void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function distributeEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

function distributeByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const safe = weights.map((w) => (w > 0 ? w : 0));
  const sum = safe.reduce((s, w) => s + w, 0);
  if (sum <= 0) return distributeEvenly(total, weights.length);
  const raw = safe.map((w) => (w / sum) * total);
  const floored = raw.map((v) => Math.floor(v));
  let rem = total - floored.reduce((s, v) => s + v, 0);
  const ranked = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let j = 0; j < ranked.length && rem > 0; j++) {
    floored[ranked[j].i] += 1;
    rem -= 1;
  }
  return floored;
}

function riskFromConversion(rate: number): RiskScore {
  if (rate >= 50) return "low";
  if (rate >= 20) return "medium";
  return "high";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TeamAllocationDialog({
  open,
  onOpenChange,
  year,
  supervisorProfile,
  teamProfiles,
  onSuccess,
}: TeamAllocationDialogProps) {
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<AllocationMode>("equal");
  const [allAgents, setAllAgents] = useState<AgentDirectoryItem[]>([]);
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [agentSort, setAgentSort] = useState<"perf" | "alpha">("perf");
  const [agentFilter, setAgentFilter] = useState<"all" | "with-target" | "no-target">("all");
  const initializedRef = useRef(false);

  const currency = supervisorProfile?.currency ?? "AED";
  const existingByAgent = new Map(teamProfiles.map((p) => [p.assigneeId, p]));
  const selectedIds = new Set(rows.map((r) => r.agentUserId));
  const visibleAgents = allAgents
    .filter((a) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (agentFilter === "with-target") return existingByAgent.has(a._id);
      if (agentFilter === "no-target") return !existingByAgent.has(a._id);
      return true;
    })
    .sort((a, b) => {
      if (agentSort === "alpha") return a.name.localeCompare(b.name);
      // perf: higher conversion first
      const aPct = existingByAgent.get(a._id)?.overallProgress ?? a.conversionRate;
      const bPct = existingByAgent.get(b._id)?.overallProgress ?? b.conversionRate;
      return bPct - aPct;
    });

  /* ---- Computed totals ---- */
  const untouchedTotals = teamProfiles
    .filter((p) => !selectedIds.has(p.assigneeId))
    .reduce(
      (s, p) => ({
        emp: s.emp + p.employerTarget,
        ee: s.ee + p.employeeTarget,
        fin: s.fin + p.financeTarget,
      }),
      { emp: 0, ee: 0, fin: 0 },
    );

  const draftTotals = rows.reduce(
    (s, r) => ({
      emp: s.emp + r.employerTarget,
      ee: s.ee + r.employeeTarget,
      fin: s.fin + r.financeTarget,
    }),
    { emp: 0, ee: 0, fin: 0 },
  );

  const remaining = {
    emp: (supervisorProfile?.employerTarget ?? 0) - untouchedTotals.emp - draftTotals.emp,
    ee: (supervisorProfile?.employeeTarget ?? 0) - untouchedTotals.ee - draftTotals.ee,
    fin: (supervisorProfile?.financeTarget ?? 0) - untouchedTotals.fin - draftTotals.fin,
  };

  /* ---- Validation ---- */
  const errors: string[] = [];
  if (!supervisorProfile) errors.push("No supervisor target profile.");
  if (rows.length === 0) errors.push("Select at least one agent.");
  if (remaining.emp < 0) errors.push("Employer over-allocated.");
  if (remaining.ee < 0) errors.push("Employee over-allocated.");
  if (remaining.fin < 0) errors.push("Finance over-allocated.");
  rows.forEach((r) => {
    if (r.employerTarget === 0 && r.employeeTarget === 0 && r.financeTarget === 0) {
      errors.push(`${r.agentName} has no targets.`);
    }
  });

  /* ---- Row builder ---- */
  const buildRow = useCallback(
    (agent: AgentDirectoryItem | undefined, profile: TeamProfile | undefined): AllocationRow => ({
      agentUserId: profile?.assigneeId ?? agent?._id ?? "",
      agentName: profile?.assigneeName ?? agent?.name ?? "Unknown",
      agentEmail: profile?.assigneeEmail ?? agent?.email ?? "",
      employerTarget: profile?.employerTarget ?? 0,
      employeeTarget: profile?.employeeTarget ?? 0,
      financeTarget: profile?.financeTarget ?? 0,
      weight: 1,
      monthlyTargets:
        profile?.monthlyAchievements?.length === 12
          ? profile.monthlyAchievements.map((m) => ({
              month: m.month,
              employerTarget: m.employerTarget,
              employeeTarget: m.employeeTarget,
              financeTarget: m.financeTarget,
            }))
          : generateMonthlyDistribution(
              {
                employerTarget: profile?.employerTarget ?? 0,
                employeeTarget: profile?.employeeTarget ?? 0,
                financeTarget: profile?.financeTarget ?? 0,
              },
              "equal",
            ),
      performancePct: profile?.overallProgress ?? agent?.conversionRate ?? 0,
      riskScore: profile?.riskScore ?? riskFromConversion(agent?.conversionRate ?? 0),
      hasExistingProfile: Boolean(profile),
    }),
    [],
  );

  /* ---- Init on open (once per dialog open) ---- */
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    setMode("equal");
    setSearch("");
    setRows(teamProfiles.map((p) => buildRow(undefined, p)));

    (async () => {
      try {
        const res = await fetch(
          "/api/super-agent/agents?sortBy=conversionRate&sortOrder=desc",
        );
        if (!res.ok) throw new Error("Failed to load agents");
        const data = await res.json();
        setAllAgents(data.items ?? []);
      } catch {
        toast.error("Failed to load team agents");
      }
    })();
  }, [open, teamProfiles, buildRow]);

  /* ---- Redistribute helper ---- */
  function redistribute(
    targetRows: AllocationRow[],
    nextMode: AllocationMode,
  ): AllocationRow[] {
    if (!supervisorProfile || targetRows.length === 0 || nextMode === "manual")
      return targetRows;

    // Compute untouched totals fresh based on which agents are in targetRows
    const rowIds = new Set(targetRows.map((r) => r.agentUserId));
    const ut = teamProfiles
      .filter((p) => !rowIds.has(p.assigneeId))
      .reduce(
        (s, p) => ({
          emp: s.emp + p.employerTarget,
          ee: s.ee + p.employeeTarget,
          fin: s.fin + p.financeTarget,
        }),
        { emp: 0, ee: 0, fin: 0 },
      );

    const available = {
      emp: Math.max(0, supervisorProfile.employerTarget - ut.emp),
      ee: Math.max(0, supervisorProfile.employeeTarget - ut.ee),
      fin: Math.max(0, supervisorProfile.financeTarget - ut.fin),
    };

    const weights =
      nextMode === "weighted"
        ? targetRows.map((r) =>
            r.weight > 0 ? r.weight : Math.max(1, r.performancePct),
          )
        : targetRows.map(() => 1);

    const distribute = (total: number) =>
      nextMode === "weighted"
        ? distributeByWeights(total, weights)
        : distributeEvenly(total, targetRows.length);

    const empArr = distribute(available.emp);
    const eeArr = distribute(available.ee);
    const finArr = distribute(available.fin);

    return targetRows.map((r, i) => {
      const annual = {
        employerTarget: empArr[i] ?? 0,
        employeeTarget: eeArr[i] ?? 0,
        financeTarget: finArr[i] ?? 0,
      };
      return {
        ...r,
        ...annual,
        weight: weights[i] ?? r.weight,
        monthlyTargets: generateMonthlyDistribution(annual, "equal"),
      };
    });
  }

  /* ---- Mode switch ---- */
  function switchMode(next: AllocationMode) {
    setMode(next);
    if (next !== "manual") {
      setRows((cur) => redistribute(cur, next));
    }
  }

  /* ---- Agent toggle ---- */
  function toggleAgent(agent: AgentDirectoryItem, checked: boolean) {
    setRows((cur) => {
      let next: AllocationRow[];
      if (checked) {
        if (cur.some((r) => r.agentUserId === agent._id)) return cur;
        const profile = existingByAgent.get(agent._id);
        next = [...cur, buildRow(agent, profile)];
      } else {
        next = cur.filter((r) => r.agentUserId !== agent._id);
      }
      return mode !== "manual" ? redistribute(next, mode) : next;
    });
  }

  function selectAllVisible() {
    setRows((cur) => {
      const additions = visibleAgents
        .filter((a) => !cur.some((r) => r.agentUserId === a._id))
        .map((a) => buildRow(a, existingByAgent.get(a._id)));
      if (additions.length === 0) return cur;
      const next = [...cur, ...additions];
      return mode !== "manual" ? redistribute(next, mode) : next;
    });
  }

  function clearAll() {
    setRows([]);
  }

  /* ---- Remove single agent from table ---- */
  function removeAgent(agentUserId: string) {
    setRows((cur) => {
      const next = cur.filter((r) => r.agentUserId !== agentUserId);
      return mode !== "manual" ? redistribute(next, mode) : next;
    });
  }

  /* ---- Reset allocations (re-distribute with current mode) ---- */
  function resetAllocations() {
    if (mode !== "manual") {
      setRows((cur) => redistribute(cur, mode));
    } else {
      setRows((cur) =>
        cur.map((r) => ({
          ...r,
          employerTarget: 0,
          employeeTarget: 0,
          financeTarget: 0,
          monthlyTargets: generateMonthlyDistribution(
            { employerTarget: 0, employeeTarget: 0, financeTarget: 0 },
            "equal",
          ),
        })),
      );
    }
  }

  /* ---- Manual input ---- */
  function handleInput(
    rowId: string,
    field: "employerTarget" | "employeeTarget" | "financeTarget",
    value: string,
  ) {
    const v = parseInt(value, 10) || 0;
    setRows((cur) =>
      cur.map((r) => {
        if (r.agentUserId !== rowId) return r;
        const annual = {
          employerTarget: field === "employerTarget" ? v : r.employerTarget,
          employeeTarget: field === "employeeTarget" ? v : r.employeeTarget,
          financeTarget: field === "financeTarget" ? v : r.financeTarget,
        };
        return {
          ...r,
          ...annual,
          monthlyTargets: generateMonthlyDistribution(annual, "equal"),
        };
      }),
    );
  }

  function handleWeightInput(rowId: string, value: string) {
    const w = parseInt(value, 10) || 0;
    setRows((cur) =>
      cur.map((r) => (r.agentUserId === rowId ? { ...r, weight: w } : r)),
    );
  }

  /* ---- Submit ---- */
  async function handleSubmit() {
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch(
        "/api/super-agent/target-profiles?action=distribute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year,
            allocationMode: mode,
            allocations: rows.map((r) => ({
              agentUserId: r.agentUserId,
              employerTarget: r.employerTarget,
              employeeTarget: r.employeeTarget,
              financeTarget: r.financeTarget,
              weight: r.weight,
              distributionStrategy: "equal",
              monthlyTargets: r.monthlyTargets,
            })),
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload.error ?? "Failed to distribute");
        return;
      }
      toast.success(`Distributed targets to ${payload.count} agents`);
      onOpenChange(false);
      await onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to distribute");
    } finally {
      setSaving(false);
    }
  }

  /* ---- Budget card data ---- */
  const budgetCards = [
    {
      key: "employer",
      label: "Employer",
      icon: <Building2 className="h-4 w-4" />,
      total: supervisorProfile?.employerTarget ?? 0,
      allocated: untouchedTotals.emp + draftTotals.emp,
      remain: remaining.emp,
      fmt: (v: number) => v.toLocaleString(),
    },
    {
      key: "employee",
      label: "Employee",
      icon: <Users className="h-4 w-4" />,
      total: supervisorProfile?.employeeTarget ?? 0,
      allocated: untouchedTotals.ee + draftTotals.ee,
      remain: remaining.ee,
      fmt: (v: number) => v.toLocaleString(),
    },
    {
      key: "finance",
      label: "Finance",
      icon: <DollarSign className="h-4 w-4" />,
      total: supervisorProfile?.financeTarget ?? 0,
      allocated: untouchedTotals.fin + draftTotals.fin,
      remain: remaining.fin,
      fmt: (v: number) => `${currency} ${v.toLocaleString()}`,
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[1000px] flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <SplitSquareVertical className="h-5 w-5 text-sky-600" />
            Distribute Targets to Agents
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Select agents, pick a strategy, and distribute your {year} targets.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Budget summary — compact horizontal bar */}
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              {budgetCards.map((c, idx) => {
                const pct =
                  c.total > 0
                    ? Math.min(Math.round((c.allocated / c.total) * 100), 100)
                    : 0;
                const status =
                  c.total === 0
                    ? "not-set"
                    : c.remain < 0
                      ? "over"
                      : c.remain === 0
                        ? "full"
                        : "ok";
                return (
                  <div key={c.key} className={`flex flex-1 items-center gap-2 ${idx > 0 ? "border-l border-border/40 pl-2" : ""}`}>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {c.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {c.label}
                        </span>
                        <Badge
                          variant={
                            status === "over"
                              ? "destructive"
                              : status === "not-set"
                                ? "outline"
                                : "success"
                          }
                          className="h-4 px-1 text-[9px]"
                        >
                          {status === "over"
                            ? "Over"
                            : status === "not-set"
                              ? "No Budget"
                              : status === "full"
                                ? "Full"
                                : "OK"}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/60">
                          <div
                            className={`h-full rounded-full transition-all ${
                              status === "over"
                                ? "bg-red-500"
                                : status === "not-set"
                                  ? "bg-muted-foreground/30"
                                  : "bg-sky-500"
                            }`}
                            style={{ width: `${status === "not-set" ? 0 : pct}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-medium tabular-nums ${
                          status === "over" ? "text-red-500" : "text-muted-foreground"
                        }`}>
                          {c.fmt(c.allocated)}/{c.fmt(c.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Strategy selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Strategy:
              </span>
              <div className="flex rounded-lg border border-border/60 p-0.5">
                {(
                  [
                    {
                      key: "equal" as const,
                      label: "Equal",
                      icon: <SplitSquareVertical className="h-3.5 w-3.5" />,
                    },
                    {
                      key: "weighted" as const,
                      label: "Weighted",
                      icon: <Weight className="h-3.5 w-3.5" />,
                    },
                    {
                      key: "manual" as const,
                      label: "Manual",
                      icon: <WandSparkles className="h-3.5 w-3.5" />,
                    },
                  ] as const
                ).map((s) => (
                  <Button
                    key={s.key}
                    variant={mode === s.key ? "default" : "ghost"}
                    size="sm"
                    className="gap-1.5 rounded-md text-xs"
                    onClick={() => switchMode(s.key)}
                  >
                    {s.icon} {s.label}
                  </Button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {mode === "equal" &&
                  "Remaining pool split evenly across selected agents"}
                {mode === "weighted" &&
                  "Split by weight column (edit weights in table)"}
                {mode === "manual" &&
                  "Type each agent\u2019s targets manually"}
              </span>
              {rows.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={resetAllocations}
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
              )}
            </div>

            {/* Agent selection + table */}
            <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
              {/* Left: agent list */}
              <div className="flex flex-col rounded-xl border border-border/60 bg-card p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Agents</p>
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                    {rows.length} selected
                  </Badge>
                </div>
                <div className="relative mt-1.5">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search agents…"
                    className="h-7 pl-7 text-[11px]"
                  />
                </div>
                {/* Sort + Filter row */}
                <div className="mt-1.5 flex items-center gap-1">
                  <Button
                    variant={agentSort === "perf" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-5 gap-0.5 px-1.5 text-[9px]"
                    onClick={() => setAgentSort(agentSort === "perf" ? "alpha" : "perf")}
                    title={agentSort === "perf" ? "Sorted by performance" : "Sorted A-Z"}
                  >
                    {agentSort === "perf" ? <TrendingUp className="h-2.5 w-2.5" /> : <ArrowDownAZ className="h-2.5 w-2.5" />}
                    {agentSort === "perf" ? "Perf" : "A-Z"}
                  </Button>
                  <div className="flex rounded border border-border/40 p-px">
                    {(
                      [
                        { key: "all" as const, label: "All" },
                        { key: "with-target" as const, label: "Active" },
                        { key: "no-target" as const, label: "New" },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition ${
                          agentFilter === f.key
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setAgentFilter(f.key)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Actions row */}
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={selectAllVisible}
                  >
                    Select all
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={clearAll}
                  >
                    Clear
                  </Button>
                </div>
                {/* Agent list */}
                <div className="mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto" style={{ maxHeight: "280px" }}>
                  {visibleAgents.length === 0 ? (
                    <p className="py-4 text-center text-[10px] text-muted-foreground">
                      No agents match filters
                    </p>
                  ) : (
                    visibleAgents.map((agent) => {
                      const sel = selectedIds.has(agent._id);
                      const hasTarget = existingByAgent.has(agent._id);
                      const pct =
                        existingByAgent.get(agent._id)?.overallProgress ??
                        agent.conversionRate;
                      return (
                        <label
                          key={agent._id}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition ${
                            sel
                              ? "border-primary/40 bg-primary/[0.04]"
                              : "border-transparent hover:bg-muted/40"
                          }`}
                        >
                          <Checkbox
                            checked={sel}
                            onCheckedChange={(c) =>
                              toggleAgent(agent, c === true)
                            }
                            className="h-3.5 w-3.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <p className="truncate font-medium leading-tight">{agent.name}</p>
                              {hasTarget && (
                                <span className="shrink-0 rounded bg-sky-100 px-1 py-px text-[8px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="truncate text-[9px] text-muted-foreground">
                              {agent.email}
                            </p>
                          </div>
                          <span
                            className={`text-[10px] font-semibold tabular-nums ${pct >= 75 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}
                          >
                            {pct}%
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right: allocation table */}
              <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                <div>
                  <table className="w-full table-fixed text-xs">
                    {mode === "weighted" ? (
                      <colgroup>
                        <col className="w-[28%]" />
                        <col className="w-[7%]" />
                        <col className="w-[18%]" />
                        <col className="w-[18%]" />
                        <col className="w-[18%]" />
                        <col className="w-[11%]" />
                      </colgroup>
                    ) : (
                      <colgroup>
                        <col className="w-[32%]" />
                        <col className="w-[8%]" />
                        <col className="w-[20%]" />
                        <col className="w-[20%]" />
                        <col className="w-[20%]" />
                      </colgroup>
                    )}
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/30 text-left">
                        <th className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Agent
                        </th>
                        <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Perf
                        </th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Employer
                        </th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Employee
                        </th>
                        <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Finance ({currency})
                        </th>
                        {mode === "weighted" && (
                          <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Wt
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={mode === "weighted" ? 6 : 5}
                            className="px-4 py-8 text-center text-xs text-muted-foreground"
                          >
                            <div className="flex flex-col items-center gap-1">
                              <Users className="h-5 w-5 text-muted-foreground/50" />
                              <span>Select agents from the left panel</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        rows.map((r) => (
                          <tr
                            key={r.agentUserId}
                            className="group hover:bg-muted/20"
                          >
                            <td className="px-2.5 py-2">
                              <div className="flex items-center gap-1 min-w-0">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium leading-tight">
                                    {r.agentName}
                                  </p>
                                  <p className="truncate text-[9px] text-muted-foreground">
                                    {r.agentEmail}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeAgent(r.agentUserId)}
                                  className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/30"
                                  title="Remove agent"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <PerformanceBadge pct={r.performancePct} />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                min={0}
                                value={r.employerTarget}
                                onChange={(e) =>
                                  handleInput(
                                    r.agentUserId,
                                    "employerTarget",
                                    e.target.value,
                                  )
                                }
                                className="h-7 w-full text-xs tabular-nums"
                                disabled={mode !== "manual"}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                min={0}
                                value={r.employeeTarget}
                                onChange={(e) =>
                                  handleInput(
                                    r.agentUserId,
                                    "employeeTarget",
                                    e.target.value,
                                  )
                                }
                                className="h-7 w-full text-xs tabular-nums"
                                disabled={mode !== "manual"}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                min={0}
                                value={r.financeTarget}
                                onChange={(e) =>
                                  handleInput(
                                    r.agentUserId,
                                    "financeTarget",
                                    e.target.value,
                                  )
                                }
                                className="h-7 w-full text-xs tabular-nums"
                                disabled={mode !== "manual"}
                              />
                            </td>
                            {mode === "weighted" && (
                              <td className="px-2 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  value={r.weight}
                                  onChange={(e) =>
                                    handleWeightInput(
                                      r.agentUserId,
                                      e.target.value,
                                    )
                                  }
                                  className="h-7 w-full text-xs tabular-nums"
                                />
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                      {/* Totals + remaining */}
                      {rows.length > 0 && (
                        <>
                          <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                            <td className="px-2.5 py-2 text-[11px]" colSpan={2}>
                              Total
                            </td>
                            <td className="px-2 py-2 text-[11px] tabular-nums">
                              {draftTotals.emp.toLocaleString()}
                            </td>
                            <td className="px-2 py-2 text-[11px] tabular-nums">
                              {draftTotals.ee.toLocaleString()}
                            </td>
                            <td className="px-2 py-2 text-[11px] tabular-nums">
                              {draftTotals.fin.toLocaleString()}
                            </td>
                            {mode === "weighted" && <td />}
                          </tr>
                          <tr className="bg-muted/10">
                            <td className="px-2.5 py-1.5 text-[10px] text-muted-foreground" colSpan={2}>
                              Remaining
                            </td>
                            <td className={`px-2 py-1.5 text-[10px] tabular-nums ${remaining.emp < 0 ? "font-semibold text-red-500" : "text-emerald-600"}`}>
                              {remaining.emp.toLocaleString()}
                            </td>
                            <td className={`px-2 py-1.5 text-[10px] tabular-nums ${remaining.ee < 0 ? "font-semibold text-red-500" : "text-emerald-600"}`}>
                              {remaining.ee.toLocaleString()}
                            </td>
                            <td className={`px-2 py-1.5 text-[10px] tabular-nums ${remaining.fin < 0 ? "font-semibold text-red-500" : "text-emerald-600"}`}>
                              {remaining.fin.toLocaleString()}
                            </td>
                            {mode === "weighted" && <td />}
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 border-t border-border/60 bg-background px-5 py-2.5 sm:justify-between">
          <div className="flex min-h-7 flex-1 items-center text-[11px] text-muted-foreground">
            {errors.length > 0 ? (
              <span className="text-red-500">{errors[0]}</span>
            ) : rows.length > 0 ? (
              <span>
                {rows.length} agent{rows.length > 1 ? "s" : ""} · {mode} distribution
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={saving || errors.length > 0}
              className="h-8 gap-1.5 bg-sky-600 text-white hover:bg-sky-700"
            >
              <Target className="h-3.5 w-3.5" />
              {saving
                ? "Distributing…"
                : `Distribute to ${rows.length} Agent${rows.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
