"use client";

import { useState, useEffect, useCallback } from "react";
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
  Plus, TrendingUp, CalendarDays,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TargetItem {
  _id: string;
  assigneeId: string;
  assigneeName?: string;
  assigneeRole: string;
  type: "employer" | "employee" | "finance";
  year: number;
  month?: number;
  targetValue: number;
  achieved: number;
  progress: number;
  currency?: string;
  status: string;
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

const TYPE_COLORS = {
  employer: "workspace-tone-sky",
  employee: "workspace-tone-emerald",
  finance: "workspace-tone-amber",
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentTargetsPage() {
  const t = useTranslations("targets");
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [yearFilter, setYearFilter] = useState(currentYear);
  const [ownTargets, setOwnTargets] = useState<TargetItem[]>([]);
  const [summary, setSummary] = useState<TargetSummary | null>(null);
  const [teamTargets, setTeamTargets] = useState<TargetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [tab, setTab] = useState<"own" | "team">("own");

  // Distribute to agents dialog
  const [showDistribute, setShowDistribute] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distType, setDistType] = useState<"employer" | "employee" | "finance">("employer");
  const [distMonth, setDistMonth] = useState(currentMonth);
  const [agents, setAgents] = useState<{ value: string; label: string }[]>([]);
  const [allocations, setAllocations] = useState<{ agentUserId: string; value: number }[]>([]);

  const fetchOwnTargets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-agent/targets?year=${yearFilter}&view=own`);
      if (res.ok) {
        const data = await res.json();
        setOwnTargets(data.targets ?? []);
        setSummary(data.summary ?? null);
      }
    } catch {
      toast.error("Failed to load targets");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  const fetchTeamTargets = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch(`/api/super-agent/targets?year=${yearFilter}&view=team`);
      if (res.ok) {
        const data = await res.json();
        setTeamTargets(data.targets ?? []);
      }
    } catch {
      toast.error("Failed to load team targets");
    } finally {
      setTeamLoading(false);
    }
  }, [yearFilter]);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/super-agent/agents?limit=100");
      if (res.ok) {
        const data = await res.json();
        const list = (data.agents ?? data.items ?? []).map(
          (a: { userId?: string; _id?: string; name?: string; user?: { name?: string; _id?: string } }) => ({
            value: a.userId ?? a.user?._id ?? a._id ?? "",
            label: a.name ?? a.user?.name ?? "Unknown",
          })
        );
        setAgents(list);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchOwnTargets(); }, [fetchOwnTargets]);
  useEffect(() => { fetchTeamTargets(); }, [fetchTeamTargets]);
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleDistribute = async () => {
    if (allocations.length === 0) {
      toast.error("Please add at least one allocation");
      return;
    }
    setDistributing(true);
    try {
      const res = await csrfFetch("/api/super-agent/targets/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: distType,
          year: yearFilter,
          month: distMonth,
          allocations,
        }),
      });
      if (res.ok) {
        toast.success("Targets distributed to agents");
        setShowDistribute(false);
        setAllocations([]);
        fetchTeamTargets();
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

  const addAllocation = () => {
    setAllocations((prev) => [...prev, { agentUserId: "", value: 0 }]);
  };

  const formatValue = (type: string, val: number, currency?: string) =>
    type === "finance" ? `${currency ?? "AED"} ${val.toLocaleString()}` : val.toLocaleString();

  // Build metrics for current month
  const metricsItems = (["employer", "employee", "finance"] as const).map((tType) => {
    const monthlyTarget = ownTargets.find((t) => t.type === tType && t.month === currentMonth);
    return {
      label: t(`${tType}Target`),
      value: monthlyTarget ? `${monthlyTarget.achieved} / ${monthlyTarget.targetValue}` : "—",
      helper: monthlyTarget ? `${monthlyTarget.progress}% ${t("achieved")}` : t("noTargetSet"),
      icon: TYPE_ICONS[tType],
      toneClassName: TYPE_COLORS[tType],
    };
  });

  // Add overall progress metric
  const totalTarget = ownTargets.filter((t) => t.month === currentMonth).reduce((s, t) => s + t.targetValue, 0);
  const totalAchieved = ownTargets.filter((t) => t.month === currentMonth).reduce((s, t) => s + t.achieved, 0);
  metricsItems.push({
    label: t("overallProgress"),
    value: totalTarget > 0 ? `${Math.round((totalAchieved / totalTarget) * 100)}%` : "—",
    helper: MONTHS_SHORT[currentMonth - 1] + ` ${yearFilter}`,
    icon: <TrendingUp className="h-5 w-5" />,
    toneClassName: "workspace-tone-violet",
  });

  return (
    <div className="space-y-6">
      <SuperAgentPageIntro
        title={t("title")}
        description={t("superAgentDescription")}
        eyebrow={t("eyebrow")}
      />

      {/* Metrics */}
      <SuperAgentMetricsGrid items={metricsItems} />

      {/* Year filter + tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="number"
            value={yearFilter}
            onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)}
            className="h-11 w-28 rounded-xl border-border bg-card pl-9 text-sm"
            aria-label="Year"
          />
        </div>
        <div className="flex rounded-xl border border-border/60 bg-card p-0.5">
          <Button
            variant={tab === "own" ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab("own")}
            className="rounded-lg"
          >
            {t("myTargets")}
          </Button>
          <Button
            variant={tab === "team" ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab("team")}
            className="rounded-lg"
          >
            {t("teamTargets")}
          </Button>
        </div>
        {tab === "team" && (
          <Button size="sm" className="ml-auto h-9 gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" onClick={() => setShowDistribute(true)}>
            <SplitSquareVertical className="h-4 w-4" />
            {t("distributeToAgents")}
          </Button>
        )}
      </div>

      {/* Own targets */}
      {tab === "own" && (
        <div className="space-y-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            (["employer", "employee", "finance"] as const).map((tType) => {
              const yearly = summary?.[tType]?.yearly;
              const monthlyList = summary?.[tType]?.monthly ?? [];
              if (!yearly && monthlyList.length === 0) return null;

              return (
                <SuperAgentSection
                  key={tType}
                  eyebrow={t(`${tType}Target`)}
                  title={yearly ? `${t("yearlyTarget")}: ${formatValue(tType, yearly.targetValue, yearly.currency)}` : t("monthlyTargetsOnly")}
                  description={
                    yearly
                      ? `${t("achieved")}: ${formatValue(tType, yearly.achieved, yearly.currency)} (${yearly.progress}%)`
                      : undefined
                  }
                >
                  {yearly && (
                    <div className="mb-4 flex items-center gap-3">
                      <Progress value={yearly.progress} className="h-3 flex-1" />
                      <span className="text-sm font-medium">{yearly.progress}%</span>
                    </div>
                  )}

                  {monthlyList.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                      {(monthlyList as TargetItem[]).map((m) => (
                        <div key={m._id} className="workspace-glass-panel rounded-xl p-3">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {MONTHS_SHORT[(m.month ?? 1) - 1]}
                          </p>
                          <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
                            {m.achieved}/{m.targetValue}
                          </p>
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
            <div className="flex flex-col items-center gap-3 py-16">
              <Crosshair className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("noTargetsAssigned")}</p>
            </div>
          )}
        </div>
      )}

      {/* Team targets */}
      {tab === "team" && (
        <SuperAgentSection title={t("agentTargets")} description={t("agentTargetsDescription")}>
          {teamLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : teamTargets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="rounded-2xl bg-muted/50 p-4">
                <Crosshair className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{t("noAgentTargets")}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("agent")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("type")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("month")}</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("target")}</TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("achieved")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("progressLabel")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamTargets.map((tgt) => (
                  <TableRow key={tgt._id}>
                    <TableCell className="font-medium">{tgt.assigneeName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {TYPE_ICONS[tgt.type]}
                        <span className="capitalize">{tgt.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>{tgt.month ? MONTHS_SHORT[tgt.month - 1] : `${t("yearly")}`}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatValue(tgt.type, tgt.targetValue, tgt.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatValue(tgt.type, tgt.achieved, tgt.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Progress value={tgt.progress} className="h-2 w-20" />
                        <span className={`text-xs font-semibold tabular-nums ${tgt.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" : tgt.progress >= 40 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{tgt.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={tgt.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </SuperAgentSection>
      )}

      {/* ---- Distribute to Agents Dialog ---- */}
      <Dialog open={showDistribute} onOpenChange={setShowDistribute}>
        <DialogContent className="max-w-lg overflow-visible">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="workspace-tone-amber rounded-xl p-2">
                <SplitSquareVertical className="h-4 w-4" />
              </div>
              {t("distributeToAgents")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("type")}</Label>
                <SearchableSelect
                  options={[
                    { value: "employer", label: "Employer" },
                    { value: "employee", label: "Employee" },
                    { value: "finance", label: "Finance" },
                  ]}
                  value={distType}
                  onValueChange={(v) => setDistType(v as typeof distType)}
                  modal
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("month")}</Label>
                <SearchableSelect
                  options={MONTHS_SHORT.map((m, i) => ({ value: String(i + 1), label: m }))}
                  value={String(distMonth)}
                  onValueChange={(v) => setDistMonth(parseInt(v))}
                  modal
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{t("year")}</Label>
                <Input type="number" value={yearFilter} disabled className="h-9" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("agentAllocations")}</Label>
                <Button variant="outline" size="sm" onClick={addAllocation} className="gap-1">
                  <Plus className="h-3 w-3" /> {t("addAgent")}
                </Button>
              </div>
              {allocations.map((alloc, idx) => (
                <div key={idx} className="grid grid-cols-[1fr,100px] gap-2">
                  <SearchableSelect
                    options={agents}
                    value={alloc.agentUserId}
                    onValueChange={(v) => {
                      const copy = [...allocations];
                      copy[idx] = { ...copy[idx], agentUserId: v };
                      setAllocations(copy);
                    }}
                    placeholder={t("selectAgent")}
                    modal
                  />
                  <Input
                    type="number"
                    value={alloc.value || ""}
                    onChange={(e) => {
                      const copy = [...allocations];
                      copy[idx] = { ...copy[idx], value: parseFloat(e.target.value) || 0 };
                      setAllocations(copy);
                    }}
                    placeholder={t("value")}
                    className="h-9"
                  />
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-sm">
              {t("totalAllocated")}: <span className="font-bold tabular-nums">{allocations.reduce((s, a) => s + a.value, 0).toLocaleString()}</span>
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
