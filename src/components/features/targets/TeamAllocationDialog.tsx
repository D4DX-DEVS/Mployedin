"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { distributeByWeights, distributeEvenly, type PeriodType, type SchedulePeriod } from "@/lib/targets/schedule";
import {
  draftFromProfile,
  draftIssues,
  newDraft,
  withAmount,
  withStrategy,
  type ScheduleDraft,
} from "@/lib/targets/scheduleDraft";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  RotateCcw,
  Search,
  SplitSquareVertical,
  Target,
  Users,
  Weight,
  WandSparkles,
} from "lucide-react";
import { ScheduleControls, SchedulePeriodsEditor, useScheduleIssue } from "./TargetScheduleEditor";
import { formatProfit } from "./profitFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AllocationMode = "equal" | "weighted" | "manual";

interface SupervisorProfile {
  profitTarget: number;
  profitAchieved: number;
  currency: string;
}

interface TeamProfile {
  assigneeId: string;
  profitTarget: number;
  profitProgress: number;
  distributionStrategy: string;
  periodType: PeriodType;
  periods: SchedulePeriod[];
}

interface TeamAgent {
  _id: string;
  name: string;
  email: string;
}

interface TargetRow {
  agentId: string;
  agentName: string;
  agentEmail: string;
  profitTarget: number;
  /** How the year is cut and what each period is worth. */
  draft: ScheduleDraft;
  showSchedule: boolean;
}

interface TeamAllocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  supervisorProfile: SupervisorProfile | null;
  teamProfiles: TeamProfile[];
  onSuccess: () => void | Promise<void>;
  /** Pre-fills the agent search when opened from a row's Adjust action, so the
   *  dialog lands on that agent instead of ignoring which row was clicked. */
  initialFilterName?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const toCents = (value: number) => Math.round((value || 0) * 100);

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
  initialFilterName = "",
}: TeamAllocationDialogProps) {
  const t = useTranslations("teamAllocationDialog");
  const locale = useLocale();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AllocationMode>("manual");
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [targetRows, setTargetRows] = useState<Record<string, TargetRow>>({});
  const [filterName, setFilterName] = useState("");
  const initializedRef = useRef(false);

  const currency = supervisorProfile?.currency ?? "AED";
  const money = (value: number) => formatProfit(value, currency, locale);

  /* ---- Init on open ---- */
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    setMode("manual");
    setFilterName(initialFilterName);
    setLoading(true);

    (async () => {
      try {
        // Only this super agent's own team: the server refuses anyone else.
        const res = await fetch(`/api/super-agent/target-profiles?view=agents&year=${year}`);
        if (!res.ok) throw new Error("Failed to load agents");
        const data = await res.json();
        const items: TeamAgent[] = data.agents ?? [];
        setAgents(items);

        // Initialize target rows — pre-fill existing profiles
        const existingByAgent = new Map(teamProfiles.map((p) => [p.assigneeId, p]));
        const initial: Record<string, TargetRow> = {};
        for (const agent of items) {
          const profile = existingByAgent.get(agent._id);
          initial[agent._id] = {
            agentId: agent._id,
            agentName: agent.name || "Unknown",
            agentEmail: agent.email,
            profitTarget: profile?.profitTarget ?? 0,
            draft: profile ? draftFromProfile(profile) : newDraft(year, 0),
            showSchedule: false,
          };
        }
        setTargetRows(initial);
      } catch {
        toast.error(t("failedToLoadAgents"));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, teamProfiles, initialFilterName, year, t]);

  const patchRow = useCallback((agentId: string, change: (row: TargetRow) => TargetRow) => {
    setTargetRows((prev) => {
      const row = prev[agentId];
      return row ? { ...prev, [agentId]: change(row) } : prev;
    });
  }, []);

  /* ---- A new amount re-spreads over the periods unless they were typed by hand ---- */
  const updateTarget = useCallback((agentId: string, profitTarget: number) => {
    patchRow(agentId, (row) => ({ ...row, profitTarget, draft: withAmount(row.draft, year, profitTarget) }));
  }, [patchRow, year]);

  const updateDraft = useCallback((agentId: string, draft: ScheduleDraft) => {
    patchRow(agentId, (row) => ({ ...row, draft }));
  }, [patchRow]);

  const toggleSchedule = useCallback((agentId: string) => {
    patchRow(agentId, (row) => ({ ...row, showSchedule: !row.showSchedule }));
  }, [patchRow]);

  /* ---- Filtered agents ---- */
  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (!filterName.trim()) return true;
      const q = filterName.trim().toLowerCase();
      return agent.name.toLowerCase().includes(q) || agent.email.toLowerCase().includes(q);
    });
  }, [agents, filterName]);

  /* ---- Rows with a target, and the ones whose months do not add up ---- */
  const validRows = useMemo(() => Object.values(targetRows).filter((row) => row.profitTarget > 0), [targetRows]);
  const brokenRows = useMemo(() => validRows.filter((row) => draftIssues(row.draft, year, row.profitTarget).length > 0), [validRows, year]);

  /* ---- Budget ---- */
  const allocatedCents = useMemo(() => validRows.reduce((sum, row) => sum + toCents(row.profitTarget), 0), [validRows]);
  const budgetCents = toCents(supervisorProfile?.profitTarget ?? 0);
  const remainingCents = budgetCents - allocatedCents;
  const overBudget = remainingCents < 0;
  const budgetStatus = budgetCents === 0 ? "not-set" : overBudget ? "over" : remainingCents === 0 ? "full" : "ok";

  /* ---- Strategy: distribute equally or by weight ---- */
  function applyStrategy(nextMode: AllocationMode) {
    setMode(nextMode);
    if (nextMode === "manual" || agents.length === 0 || !supervisorProfile) return;

    const total = toCents(Math.max(0, supervisorProfile.profitTarget));
    const existingByAgent = new Map(teamProfiles.map((p) => [p.assigneeId, p]));
    const shares = nextMode === "weighted"
      ? distributeByWeights(total, agents.map((agent) => Math.max(1, existingByAgent.get(agent._id)?.profitProgress ?? 1)))
      : distributeEvenly(total, agents.length);

    setTargetRows((prev) => {
      const updated = { ...prev };
      agents.forEach((agent, i) => {
        const row = updated[agent._id];
        if (!row) return;
        const profitTarget = (shares[i] ?? 0) / 100;
        // An even or weighted share replaces typed amounts, so the split goes back to a rule.
        const draft = row.draft.strategy === "custom" ? withStrategy(row.draft, profitTarget, "equal") : withAmount(row.draft, year, profitTarget);
        updated[agent._id] = { ...row, profitTarget, draft };
      });
      return updated;
    });
  }

  /* ---- Reset ---- */
  function resetAllocations() {
    setTargetRows((prev) => {
      const updated = { ...prev };
      for (const id of Object.keys(updated)) {
        updated[id] = { ...updated[id], profitTarget: 0, draft: newDraft(year, 0, updated[id].draft.periodType) };
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
    if (overBudget) {
      toast.error(t("overAllocatedToast"));
      return;
    }
    if (brokenRows.length > 0) {
      toast.error(t("sumMismatch"));
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
              profitTarget: r.profitTarget,
              weight: 1,
              periodType: r.draft.periodType,
              distributionStrategy: r.draft.strategy,
              periods: r.draft.periods,
            })),
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload.error ?? t("failedToDistribute"));
        return;
      }
      toast.success(t("distributedToast", { count: payload.count ?? validRows.length }));
      onOpenChange(false);
      await onSuccess();
    } catch {
      toast.error(t("distributeFailedToast"));
    } finally {
      setSaving(false);
    }
  }

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
            {/* Budget summary */}
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 chip-pad">
              <CircleDollarSign className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("budgetLabel")}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {t("budgetUsed", { allocated: money(allocatedCents / 100), total: money(budgetCents / 100) })}
                  </span>
                  <Badge
                    variant={budgetStatus === "over" ? "destructive" : budgetStatus === "not-set" ? "outline" : "success"}
                    className="h-4 px-1 text-[9px]"
                  >
                    {budgetStatus === "over" ? t("over") : budgetStatus === "not-set" ? t("noBudget") : budgetStatus === "full" ? t("full") : t("withinBudget")}
                  </Badge>
                </div>
              </div>
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
                className="ms-auto h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={resetAllocations}
              >
                <RotateCcw className="h-3 w-3" /> {t("reset")}
              </Button>
            </div>

            {/* Search bar */}
            <div className="relative max-w-xs">
              <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder={t("searchAgents")}
                aria-label={t("searchAgents")}
                className="h-8 rounded-lg border-border bg-background ps-8 text-xs"
              />
            </div>

            {/* Main Table */}
            <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">{t("noAgentsInTeam")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/70 bg-muted/40">
                      <tr>
                        <th className="w-[30%] px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("agent")}
                        </th>
                        <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("profitTarget")}
                        </th>
                        <th className="min-w-[240px] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("scheduleColumn")}
                        </th>
                        <th className="w-[80px] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("periodsColumn")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredAgents.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {t("noAgentsMatch")}
                          </td>
                        </tr>
                      ) : (
                        filteredAgents.map((agent) => {
                          const row = targetRows[agent._id];
                          if (!row) return null;
                          const hasTarget = row.profitTarget > 0;
                          return (
                            <AgentTargetRow
                              key={agent._id}
                              agent={agent}
                              row={row}
                              currency={currency}
                              hasTarget={hasTarget}
                              year={year}
                              disabled={mode !== "manual"}
                              onUpdateTarget={updateTarget}
                              onUpdateDraft={updateDraft}
                              onToggleSchedule={toggleSchedule}
                            />
                          );
                        })
                      )}
                    </tbody>
                    {/* Totals + Remaining */}
                    <tfoot className="border-t-2 border-border bg-muted/30">
                      <tr>
                        <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
                          {t("total")} ({t("agentCount", { count: validRows.length })})
                        </td>
                        <td className="px-3 py-2.5 text-center text-sm font-bold tabular-nums text-foreground" colSpan={3}>
                          {money(allocatedCents / 100)}
                        </td>
                      </tr>
                      <tr className="bg-muted/10">
                        <td className="px-4 py-2 text-xs text-muted-foreground">{t("remaining")}</td>
                        <td className={`px-3 py-2 text-center text-xs font-semibold tabular-nums ${overBudget ? "text-red-500" : "text-emerald-600"}`} colSpan={3}>
                          {money(remainingCents / 100)}
                        </td>
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
            ) : overBudget ? (
              <span className="text-red-500">{t("overAllocated")}</span>
            ) : brokenRows.length > 0 ? (
              <span role="alert" className="text-red-500">{t("sumMismatch")}</span>
            ) : validRows.length > 0 ? (
              <span>{t("summaryLine", { count: validRows.length, mode: t(mode) })}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="dense" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              size="dense"
              onClick={handleSubmit}
              disabled={saving || validRows.length === 0 || !supervisorProfile || overBudget || brokenRows.length > 0}
              className="gap-1.5 bg-sky-600 text-white hover:bg-sky-700"
            >
              <Target className="h-3.5 w-3.5" />
              {saving ? t("distributing") : t("distributeTo", { count: validRows.length })}
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
  agent: TeamAgent;
  row: TargetRow;
  currency: string;
  hasTarget: boolean;
  year: number;
  disabled: boolean;
  onUpdateTarget: (id: string, profitTarget: number) => void;
  onUpdateDraft: (id: string, draft: ScheduleDraft) => void;
  onToggleSchedule: (id: string) => void;
}

function AgentTargetRow({
  agent,
  row,
  currency,
  hasTarget,
  year,
  disabled,
  onUpdateTarget,
  onUpdateDraft,
  onToggleSchedule,
}: AgentTargetRowProps) {
  const t = useTranslations("teamAllocationDialog");
  const issue = useScheduleIssue(row.draft, year, row.profitTarget, currency);

  return (
    <>
      <tr className={`transition-colors ${hasTarget ? "bg-sky-50/50" : "hover:bg-muted/20"}`}>
        <td className="px-4 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">{agent.name}</p>
            <p className="text-[11px] text-muted-foreground">{agent.email}</p>
          </div>
        </td>

        <td className="px-3 py-2.5">
          <div className="relative">
            <Input
              type="number"
              aria-label={t("profitTarget")}
              min={0}
              step="0.01"
              inputMode="decimal"
              value={row.profitTarget || ""}
              onChange={(e) => onUpdateTarget(agent._id, Number(e.target.value) || 0)}
              placeholder="0"
              className="h-9 w-full rounded-lg border-border bg-background pe-12 text-center text-sm tabular-nums"
              disabled={disabled}
            />
            <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
              {currency}
            </span>
          </div>
        </td>

        <td className="px-3 py-2.5">
          <ScheduleControls
            draft={row.draft}
            year={year}
            profitTarget={row.profitTarget}
            onChange={(draft) => onUpdateDraft(agent._id, draft)}
            disabled={!hasTarget}
          />
          {hasTarget && issue ? <p role="alert" className="mt-1 text-[11px] font-medium text-rose-600">{issue}</p> : null}
        </td>

        <td className="px-3 py-2.5 text-center">
          <Button
            type="button"
            aria-label={t("toggleSchedule")}
            variant={row.showSchedule ? "default" : "outline"}
            size="dense"
            className="gap-1 rounded-lg text-xs"
            onClick={() => onToggleSchedule(agent._id)}
            disabled={!hasTarget}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {row.showSchedule ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </td>
      </tr>

      {row.showSchedule && hasTarget && (
        <tr className="bg-muted/10">
          <td colSpan={4} className="px-4 py-3">
            <SchedulePeriodsEditor
              draft={row.draft}
              year={year}
              profitTarget={row.profitTarget}
              currency={currency}
              onChange={(draft) => onUpdateDraft(agent._id, draft)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
