"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import { generateMonthlyDistribution } from "@/lib/targets/distributionStrategies";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Loader2,
  RotateCcw,
  Search,
  SplitSquareVertical,
  Target,
  Users,
  Weight,
  WandSparkles,
} from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

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

interface TargetRow {
  agentId: string;
  agentName: string;
  agentEmail: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  showMonthly: boolean;
  monthlyTargets: MonthlyTarget[];
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

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function generateEqualDistribution(annual: { employerTarget: number; employeeTarget: number; financeTarget: number }): MonthlyTarget[] {
  return Array.from({ length: 12 }, (_, i) => {
    const empPer = Math.floor(annual.employerTarget / 12);
    const empRem = annual.employerTarget - empPer * 12;
    const emplPer = Math.floor(annual.employeeTarget / 12);
    const emplRem = annual.employeeTarget - emplPer * 12;
    const finPer = Math.floor(annual.financeTarget / 12);
    const finRem = annual.financeTarget - finPer * 12;
    return {
      month: i + 1,
      employerTarget: empPer + (i < empRem ? 1 : 0),
      employeeTarget: emplPer + (i < emplRem ? 1 : 0),
      financeTarget: finPer + (i < finRem ? 1 : 0),
    };
  });
}

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
  const t = useTranslations("teamAllocationDialog");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AllocationMode>("manual");
  const [agents, setAgents] = useState<AgentDirectoryItem[]>([]);
  const [targetRows, setTargetRows] = useState<Record<string, TargetRow>>({});
  const [filterName, setFilterName] = useState("");
  const initializedRef = useRef(false);

  const currency = supervisorProfile?.currency ?? "AED";

  /* ---- Init on open ---- */
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    setMode("manual");
    setFilterName("");
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(
          "/api/super-agent/agents?sortBy=name&sortOrder=asc&limit=200",
        );
        if (!res.ok) throw new Error("Failed to load agents");
        const data = await res.json();
        const items: AgentDirectoryItem[] = data.items ?? [];
        setAgents(items);

        // Initialize target rows — pre-fill existing profiles
        const existingByAgent = new Map(teamProfiles.map((p) => [p.assigneeId, p]));
        const initial: Record<string, TargetRow> = {};
        for (const agent of items) {
          const profile = existingByAgent.get(agent._id);
          initial[agent._id] = {
            agentId: agent._id,
            agentName: agent.name ?? "Unknown",
            agentEmail: agent.email ?? "",
            employerTarget: profile?.employerTarget ?? 0,
            employeeTarget: profile?.employeeTarget ?? 0,
            financeTarget: profile?.financeTarget ?? 0,
            showMonthly: false,
            monthlyTargets: profile?.monthlyAchievements?.length === 12
              ? profile.monthlyAchievements.map((m) => ({
                  month: m.month,
                  employerTarget: m.employerTarget,
                  employeeTarget: m.employeeTarget,
                  financeTarget: m.financeTarget,
                }))
              : generateEqualDistribution({
                  employerTarget: profile?.employerTarget ?? 0,
                  employeeTarget: profile?.employeeTarget ?? 0,
                  financeTarget: profile?.financeTarget ?? 0,
                }),
          };
        }
        setTargetRows(initial);
      } catch {
        toast.error(t("failedToLoadAgents"));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, teamProfiles]);

  /* ---- Update target for an agent ---- */
  const updateTarget = useCallback((agentId: string, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => {
    setTargetRows((prev) => {
      const row = prev[agentId];
      if (!row) return prev;
      const updated = { ...row, [field]: value };
      updated.monthlyTargets = generateEqualDistribution({
        employerTarget: updated.employerTarget,
        employeeTarget: updated.employeeTarget,
        financeTarget: updated.financeTarget,
      });
      return { ...prev, [agentId]: updated };
    });
  }, []);

  /* ---- Toggle monthly ---- */
  const toggleMonthly = useCallback((agentId: string) => {
    setTargetRows((prev) => {
      const row = prev[agentId];
      if (!row) return prev;
      return { ...prev, [agentId]: { ...row, showMonthly: !row.showMonthly } };
    });
  }, []);

  /* ---- Update monthly target ---- */
  const updateMonthlyTarget = useCallback((agentId: string, month: number, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => {
    setTargetRows((prev) => {
      const row = prev[agentId];
      if (!row) return prev;
      const updatedMonthly = row.monthlyTargets.map((m) =>
        m.month === month ? { ...m, [field]: value } : m
      );
      return { ...prev, [agentId]: { ...row, monthlyTargets: updatedMonthly } };
    });
  }, []);

  /* ---- Filtered agents ---- */
  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (!filterName.trim()) return true;
      const q = filterName.trim().toLowerCase();
      return agent.name.toLowerCase().includes(q) || agent.email.toLowerCase().includes(q);
    });
  }, [agents, filterName]);

  /* ---- Valid rows (at least one target > 0) ---- */
  const validRows = useMemo(() => {
    return Object.values(targetRows).filter(
      (row) => row.employerTarget > 0 || row.employeeTarget > 0 || row.financeTarget > 0
    );
  }, [targetRows]);

  /* ---- Totals ---- */
  const totals = useMemo(() => {
    return validRows.reduce(
      (acc, row) => ({
        employer: acc.employer + row.employerTarget,
        employee: acc.employee + row.employeeTarget,
        finance: acc.finance + row.financeTarget,
      }),
      { employer: 0, employee: 0, finance: 0 }
    );
  }, [validRows]);

  /* ---- Remaining budget ---- */
  const remaining = useMemo(() => ({
    emp: (supervisorProfile?.employerTarget ?? 0) - totals.employer,
    ee: (supervisorProfile?.employeeTarget ?? 0) - totals.employee,
    fin: (supervisorProfile?.financeTarget ?? 0) - totals.finance,
  }), [supervisorProfile, totals]);

  /* ---- Strategy: distribute equally or by weight ---- */
  function applyStrategy(nextMode: AllocationMode) {
    setMode(nextMode);
    if (nextMode === "manual") return;

    const agentIds = agents.map((a) => a._id);
    const count = agentIds.length;
    if (count === 0 || !supervisorProfile) return;

    const available = {
      emp: Math.max(0, supervisorProfile.employerTarget),
      ee: Math.max(0, supervisorProfile.employeeTarget),
      fin: Math.max(0, supervisorProfile.financeTarget),
    };

    let empArr: number[];
    let eeArr: number[];
    let finArr: number[];

    if (nextMode === "weighted") {
      const existingByAgent = new Map(teamProfiles.map((p) => [p.assigneeId, p]));
      const weights = agentIds.map((id) => {
        const profile = existingByAgent.get(id);
        const agent = agents.find((a) => a._id === id);
        return Math.max(1, profile?.overallProgress ?? agent?.conversionRate ?? 1);
      });
      empArr = distributeByWeights(available.emp, weights);
      eeArr = distributeByWeights(available.ee, weights);
      finArr = distributeByWeights(available.fin, weights);
    } else {
      empArr = distributeEvenly(available.emp, count);
      eeArr = distributeEvenly(available.ee, count);
      finArr = distributeEvenly(available.fin, count);
    }

    setTargetRows((prev) => {
      const updated = { ...prev };
      agentIds.forEach((id, i) => {
        const row = updated[id];
        if (!row) return;
        const annual = {
          employerTarget: empArr[i] ?? 0,
          employeeTarget: eeArr[i] ?? 0,
          financeTarget: finArr[i] ?? 0,
        };
        updated[id] = {
          ...row,
          ...annual,
          monthlyTargets: generateEqualDistribution(annual),
        };
      });
      return updated;
    });
  }

  /* ---- Reset ---- */
  function resetAllocations() {
    setTargetRows((prev) => {
      const updated = { ...prev };
      for (const id of Object.keys(updated)) {
        updated[id] = {
          ...updated[id],
          employerTarget: 0,
          employeeTarget: 0,
          financeTarget: 0,
          monthlyTargets: generateEqualDistribution({ employerTarget: 0, employeeTarget: 0, financeTarget: 0 }),
        };
      }
      return updated;
    });
    setMode("manual");
  }

  /* ---- Submit ---- */
  async function handleSubmit() {
    if (validRows.length === 0) {
      toast.error(t("enterTargetsForAtLeastOne"));
      return;
    }
    if (remaining.emp < 0 || remaining.ee < 0 || remaining.fin < 0) {
      toast.error(t("overAllocatedToast"));
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
            allocations: validRows.map((r) => ({
              agentUserId: r.agentId,
              employerTarget: r.employerTarget,
              employeeTarget: r.employeeTarget,
              financeTarget: r.financeTarget,
              weight: 1,
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
      toast.success(`Distributed targets to ${payload.count ?? validRows.length} agents`);
      onOpenChange(false);
      await onSuccess();
    } catch (e) {
      toast.error("We couldn't distribute these targets. Existing assignments are unchanged. Review the allocation and try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ---- Budget cards ---- */
  const budgetCards = [
    {
      key: "employer",
      label: "EMPLOYER",
      icon: <Building2 className="h-4 w-4" />,
      total: supervisorProfile?.employerTarget ?? 0,
      allocated: totals.employer,
      remain: remaining.emp,
    },
    {
      key: "employee",
      label: "EMPLOYEE",
      icon: <Users className="h-4 w-4" />,
      total: supervisorProfile?.employeeTarget ?? 0,
      allocated: totals.employee,
      remain: remaining.ee,
    },
    {
      key: "finance",
      label: "FINANCE",
      icon: <DollarSign className="h-4 w-4" />,
      total: supervisorProfile?.financeTarget ?? 0,
      allocated: totals.finance,
      remain: remaining.fin,
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 panel-head">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <SplitSquareVertical className="h-5 w-5 text-sky-600" />
            {t("distributeTargetsToAgents")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("setTargetsDescription", { year })}
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Budget summary — horizontal cards */}
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 chip-pad">
              {budgetCards.map((c, idx) => {
                const status =
                  c.total === 0
                    ? "not-set"
                    : c.remain < 0
                      ? "over"
                      : c.remain === 0
                        ? "full"
                        : "ok";
                return (
                  <div key={c.key} className={`flex flex-1 items-center gap-2 ${idx > 0 ? "border-l border-border/40 pl-3" : ""}`}>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
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
                            ? t("over")
                            : status === "not-set"
                              ? t("noBudget")
                              : status === "full"
                                ? t("full")
                                : `${c.allocated}/${c.total}`}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Strategy + Search */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t("strategy")}:</span>
              <div className="flex rounded-lg border border-border/60 p-0.5">
                {([
                  { key: "equal" as const, label: t("equal"), icon: <SplitSquareVertical className="h-3.5 w-3.5" /> },
                  { key: "weighted" as const, label: t("weighted"), icon: <Weight className="h-3.5 w-3.5" /> },
                  { key: "manual" as const, label: t("manual"), icon: <WandSparkles className="h-3.5 w-3.5" /> },
                ]).map((s) => (
                  <Button
                    key={s.key}
                    variant={mode === s.key ? "default" : "ghost"}
                    size="sm"
                    className="gap-1.5 rounded-md text-xs"
                    onClick={() => applyStrategy(s.key)}
                  >
                    {s.icon} {s.label}
                  </Button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {mode === "equal" && t("equalDesc")}
                {mode === "weighted" && t("weightedDesc")}
                {mode === "manual" && t("manualDesc")}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={resetAllocations}
              >
                <RotateCcw className="h-3 w-3" /> {t("reset")}
              </Button>
            </div>

            {/* Search bar */}
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder={t("searchAgents")}
                className="h-8 rounded-lg border-border bg-background pl-8 text-xs"
              />
            </div>

            {/* Main Table */}
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("noAgentsInTeam")}</p>
                </div>
              ) : (
                <div>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border/70">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-[30%]">
                          {t("agent")}
                        </th>
                        <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <div className="flex items-center justify-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            {t("employers")}
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <div className="flex items-center justify-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            {t("employees")}
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <div className="flex items-center justify-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5" />
                            {t("revenue")}
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-[80px]">
                          {t("monthly")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredAgents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {t("noAgentsMatch")}
                          </td>
                        </tr>
                      ) : (
                        filteredAgents.map((agent) => {
                          const row = targetRows[agent._id];
                          if (!row) return null;
                          return (
                            <AgentTargetRow
                              key={agent._id}
                              agent={agent}
                              row={row}
                              currency={currency}
                              disabled={mode !== "manual"}
                              onUpdateTarget={updateTarget}
                              onToggleMonthly={toggleMonthly}
                              onUpdateMonthly={updateMonthlyTarget}
                              t={t}
                            />
                          );
                        })
                      )}
                    </tbody>
                    {/* Totals + Remaining */}
                    <tfoot className="bg-muted/30 border-t-2 border-border">
                      <tr>
                        <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
                          {t("total")} ({validRows.length} {t(validRows.length !== 1 ? "agents" : "agent")})
                        </td>
                        <td className="px-3 py-2.5 text-center text-sm font-bold text-foreground tabular-nums">
                          {formatCount(totals.employer)}
                        </td>
                        <td className="px-3 py-2.5 text-center text-sm font-bold text-foreground tabular-nums">
                          {formatCount(totals.employee)}
                        </td>
                        <td className="px-3 py-2.5 text-center text-sm font-bold text-foreground tabular-nums">
                          {formatCount(totals.finance)}
                        </td>
                        <td className="px-3 py-2.5" />
                      </tr>
                      <tr className="bg-muted/10">
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {t("remaining")}
                        </td>
                        <td className={`px-3 py-2 text-center text-xs font-semibold tabular-nums ${remaining.emp < 0 ? "text-red-500" : "text-emerald-600"}`}>
                          {formatCount(remaining.emp)}
                        </td>
                        <td className={`px-3 py-2 text-center text-xs font-semibold tabular-nums ${remaining.ee < 0 ? "text-red-500" : "text-emerald-600"}`}>
                          {formatCount(remaining.ee)}
                        </td>
                        <td className={`px-3 py-2 text-center text-xs font-semibold tabular-nums ${remaining.fin < 0 ? "text-red-500" : "text-emerald-600"}`}>
                          {formatCount(remaining.fin)}
                        </td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 border-t border-border/60 bg-background px-5 py-3 sm:justify-between">
          <div className="flex min-h-7 flex-1 items-center text-[11px] text-muted-foreground">
            {!supervisorProfile ? (
              <span className="text-red-500">{t("noSupervisorProfile")}</span>
            ) : remaining.emp < 0 || remaining.ee < 0 || remaining.fin < 0 ? (
              <span className="text-red-500">{t("overAllocated")}</span>
            ) : validRows.length > 0 ? (
              <span>{validRows.length} {t(validRows.length > 1 ? "agents" : "agent")} · {mode} {t("distribution")}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="dense"
              className=""
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              size="dense"
              onClick={handleSubmit}
              disabled={saving || validRows.length === 0 || !supervisorProfile}
              className="gap-1.5 bg-sky-600 text-white hover:bg-sky-700"
            >
              <Target className="h-3.5 w-3.5" />
              {saving
                ? t("distributing")
                : `${t("distributeTo")} ${validRows.length} ${t(validRows.length !== 1 ? "agents" : "agent")}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Row                                                          */
/* ------------------------------------------------------------------ */

interface AgentTargetRowProps {
  agent: AgentDirectoryItem;
  row: TargetRow;
  currency: string;
  disabled: boolean;
  onUpdateTarget: (id: string, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => void;
  onToggleMonthly: (id: string) => void;
  onUpdateMonthly: (id: string, month: number, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => void;
  t: ReturnType<typeof useTranslations>;
}

function AgentTargetRow({
  agent,
  row,
  currency,
  disabled,
  onUpdateTarget,
  onToggleMonthly,
  onUpdateMonthly,
  t,
}: AgentTargetRowProps) {
  const hasTarget = row.employerTarget > 0 || row.employeeTarget > 0 || row.financeTarget > 0;

  return (
    <>
      <tr className={`transition-colors ${hasTarget ? "bg-sky-50/50" : "hover:bg-muted/20"}`}>
        {/* Agent Info */}
        <td className="px-4 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">{agent.name}</p>
            <p className="text-[11px] text-muted-foreground">{agent.email}</p>
          </div>
        </td>

        {/* Employer Target */}
        <td className="px-3 py-2.5">
          <Input
            type="number"
            min={0}
            value={row.employerTarget || ""}
            onChange={(e) => onUpdateTarget(agent._id, "employerTarget", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="h-9 w-full rounded-lg border-border bg-background text-center text-sm tabular-nums"
            disabled={disabled}
          />
        </td>

        {/* Employee Target */}
        <td className="px-3 py-2.5">
          <Input
            type="number"
            min={0}
            value={row.employeeTarget || ""}
            onChange={(e) => onUpdateTarget(agent._id, "employeeTarget", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="h-9 w-full rounded-lg border-border bg-background text-center text-sm tabular-nums"
            disabled={disabled}
          />
        </td>

        {/* Revenue Target */}
        <td className="px-3 py-2.5">
          <div className="relative">
            <Input
              type="number"
              min={0}
              value={row.financeTarget || ""}
              onChange={(e) => onUpdateTarget(agent._id, "financeTarget", parseInt(e.target.value) || 0)}
              placeholder="0"
              className="h-9 w-full rounded-lg border-border bg-background text-center text-sm tabular-nums pr-11"
              disabled={disabled}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">
              {currency}
            </span>
          </div>
        </td>

        {/* Monthly Toggle */}
        <td className="px-3 py-2.5 text-center">
          <Button
            type="button"
            variant={row.showMonthly ? "default" : "outline"}
            size="dense"
            className="rounded-lg text-xs gap-1"
            onClick={() => onToggleMonthly(agent._id)}
            disabled={!hasTarget}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {row.showMonthly ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </td>
      </tr>

      {/* Monthly Distribution Expanded */}
      {row.showMonthly && hasTarget && (
        <tr className="bg-muted/10">
          <td colSpan={5} className="px-4 py-3">
            <MonthlyDistributionTable
              agentId={agent._id}
              monthly={row.monthlyTargets}
              currency={currency}
              annualTargets={{
                employerTarget: row.employerTarget,
                employeeTarget: row.employeeTarget,
                financeTarget: row.financeTarget,
              }}
              onUpdate={onUpdateMonthly}
              t={t}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Monthly Distribution Table                                         */
/* ------------------------------------------------------------------ */

interface MonthlyDistributionTableProps {
  agentId: string;
  monthly: MonthlyTarget[];
  currency: string;
  annualTargets: { employerTarget: number; employeeTarget: number; financeTarget: number };
  onUpdate: (agentId: string, month: number, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => void;
  t: ReturnType<typeof useTranslations>;
}

function MonthlyDistributionTable({
  agentId,
  monthly,
  currency,
  annualTargets,
  onUpdate,
  t,
}: MonthlyDistributionTableProps) {
  const monthlySum = monthly.reduce(
    (acc, m) => ({
      employer: acc.employer + m.employerTarget,
      employee: acc.employee + m.employeeTarget,
      finance: acc.finance + m.financeTarget,
    }),
    { employer: 0, employee: 0, finance: 0 }
  );

  const isValid =
    monthlySum.employer === annualTargets.employerTarget &&
    monthlySum.employee === annualTargets.employeeTarget &&
    monthlySum.finance === annualTargets.financeTarget;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">{t("monthlyDistribution")}</p>
        {!isValid && (
          <Badge variant="destructive" className="text-[10px]">
            {t("sumMismatch")}
          </Badge>
        )}
      </div>
      <div className="rounded-lg border border-border/60 bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-2 py-2 text-left font-semibold text-muted-foreground">{t("month")}</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">{t("employers")}</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">{t("employees")}</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">{t("revenue")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {monthly.map((m) => (
              <tr key={m.month} className="hover:bg-muted/10">
                <td className="px-2 py-1.5 font-medium text-muted-foreground">{MONTHS_SHORT[m.month - 1]}</td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    value={m.employerTarget || ""}
                    onChange={(e) => onUpdate(agentId, m.month, "employerTarget", parseInt(e.target.value) || 0)}
                    className="h-7 w-full rounded border-border/60 bg-background text-center text-xs tabular-nums"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    value={m.employeeTarget || ""}
                    onChange={(e) => onUpdate(agentId, m.month, "employeeTarget", parseInt(e.target.value) || 0)}
                    className="h-7 w-full rounded border-border/60 bg-background text-center text-xs tabular-nums"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    value={m.financeTarget || ""}
                    onChange={(e) => onUpdate(agentId, m.month, "financeTarget", parseInt(e.target.value) || 0)}
                    className="h-7 w-full rounded border-border/60 bg-background text-center text-xs tabular-nums"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/20 border-t border-border">
            <tr>
              <td className="px-2 py-1.5 font-semibold">{t("total")}</td>
              <td className={`px-2 py-1.5 text-center font-bold tabular-nums ${monthlySum.employer !== annualTargets.employerTarget ? "text-red-500" : ""}`}>
                {monthlySum.employer}
              </td>
              <td className={`px-2 py-1.5 text-center font-bold tabular-nums ${monthlySum.employee !== annualTargets.employeeTarget ? "text-red-500" : ""}`}>
                {monthlySum.employee}
              </td>
              <td className={`px-2 py-1.5 text-center font-bold tabular-nums ${monthlySum.finance !== annualTargets.financeTarget ? "text-red-500" : ""}`}>
                {monthlySum.finance}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
