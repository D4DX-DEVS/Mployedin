"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { csrfFetch } from "@/lib/security/csrf-client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ArrowLeft, Building2, Users, DollarSign,
  CalendarDays, Target, Loader2, ChevronDown, ChevronRight,
  Save, Filter, Search, X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { formatCount } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyTarget {
  month: number;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
}

interface AgentRow {
  id: string;
  name: string;
  email: string;
  territory: string;
  currency: string;
}

interface TargetRow {
  agentId: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  showMonthly: boolean;
  monthlyTargets: MonthlyTarget[];
}

// MONTHS_SHORT resolved in component with useTranslations hook, see below

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

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SuperAgentCreateTargetPage() {
  const t = useTranslations("targets");
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  // Translated month names
  const monthsShort = useMemo(() => [
    t("months.jan"),
    t("months.feb"),
    t("months.mar"),
    t("months.apr"),
    t("months.may"),
    t("months.jun"),
    t("months.jul"),
    t("months.aug"),
    t("months.sep"),
    t("months.oct"),
    t("months.nov"),
    t("months.dec"),
  ], [t]);

  const [year, setYear] = useState(currentYear + 1);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  // Agents list under this super agent
  const [agents, setAgents] = useState<AgentRow[]>([]);

  // Target data per agent
  const [targetRows, setTargetRows] = useState<Record<string, TargetRow>>({});

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterRegion, setFilterRegion] = useState("");

  // Fetch agents under the super agent
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/super-agent/agents?sortBy=name&sortOrder=asc&limit=200", {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load agents");
        const data = await res.json();
        const rows: AgentRow[] = (data.items ?? []).map(
          (agent: {
            _id: string;
            name: string;
            email: string;
            country?: string;
            currencyCode?: string;
          }) => ({
            id: agent._id,
            name: agent.name ?? "Unknown",
            email: agent.email ?? "",
            territory: agent.country ?? "",
            currency: agent.currencyCode ?? "AED",
          })
        );
        setAgents(rows);

        // Initialize target rows
        const initial: Record<string, TargetRow> = {};
        for (const agent of rows) {
          initial[agent.id] = {
            agentId: agent.id,
            employerTarget: 0,
            employeeTarget: 0,
            financeTarget: 0,
            showMonthly: false,
            monthlyTargets: generateEqualDistribution({ employerTarget: 0, employeeTarget: 0, financeTarget: 0 }),
          };
        }
        setTargetRows(initial);
      } catch {
        if (!controller.signal.aborted) {
          toast.error(t("failedToLoadAgents"));
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  // Update annual target for an agent
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

  // Toggle monthly distribution view
  const toggleMonthly = useCallback((agentId: string) => {
    setTargetRows((prev) => {
      const row = prev[agentId];
      if (!row) return prev;
      return { ...prev, [agentId]: { ...row, showMonthly: !row.showMonthly } };
    });
  }, []);

  // Update monthly target for an agent
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

  // Derived region options
  const regionOptions = useMemo(() => {
    const regions = [...new Set(agents.map((a) => a.territory).filter(Boolean))].sort();
    return regions;
  }, [agents]);

  // Filtered agents
  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (filterName.trim()) {
        const q = filterName.trim().toLowerCase();
        if (!agent.name.toLowerCase().includes(q) && !agent.email.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterRegion) {
        if (agent.territory !== filterRegion) return false;
      }
      return true;
    });
  }, [agents, filterName, filterRegion]);

  const hasActiveFilters = filterName.trim() !== "" || filterRegion !== "";

  const clearFilters = () => {
    setFilterName("");
    setFilterRegion("");
  };

  // Get rows that have at least one target value > 0
  const validRows = useMemo(() => {
    return Object.values(targetRows).filter(
      (row) => row.employerTarget > 0 || row.employeeTarget > 0 || row.financeTarget > 0
    );
  }, [targetRows]);

  // Totals
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

  // Submit targets
  const handleCreate = async () => {
    if (validRows.length === 0) {
      toast.error(t("enterTargetsForAtLeastOne"));
      return;
    }

    setCreating(true);
    try {
      const payload = {
        year,
        allocationMode: "manual" as const,
        allocations: validRows.map((row) => {
          const agent = agents.find((a) => a.id === row.agentId);
          return {
            agentUserId: row.agentId,
            employerTarget: row.employerTarget,
            employeeTarget: row.employeeTarget,
            financeTarget: row.financeTarget,
            currency: agent?.currency ?? "AED",
            distributionStrategy: "custom" as const,
            monthlyTargets: row.monthlyTargets,
          };
        }),
      };

      const res = await csrfFetch("/api/super-agent/target-profiles?action=distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const created = Number(data.created ?? data.profiles?.length ?? validRows.length);
        toast.success(`${created} agent target${created !== 1 ? "s" : ""} created successfully`);
        router.push(`/${locale}/super-agent/target-management?year=${year}`);
      } else {
        toast.error(data.error ?? "Failed to create targets");
      }
    } catch {
      toast.error(t("failedCreateAgentTargets"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-container max-w-6xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.push(`/${locale}/super-agent/target-management`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {t("backToTargetManagement")}
      </button>

      {/* Header */}
      <DashboardPageHeader
        icon={Target}
        title={t("assignAgentTargets")}
        description={t("assignAgentTargetsDesc")}
        actions={
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || currentYear)}
                className="h-9 w-20 rounded-lg border-border bg-card text-center text-sm"
              />
            </div>
        }
      />

      {/* Filter Toggle + Panel */}
      <div className="workspace-glass-panel rounded-2xl overflow-hidden">
        {/* Filter Header */}
        <div className="flex items-center justify-between border-b border-border/50 panel-head">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Filter className="h-4 w-4" />
            {t("filters")}
            {hasActiveFilters && (
              <Badge variant="info" className="text-[11px] px-1.5 py-0">
                {[filterName, filterRegion].filter(Boolean).length}
              </Badge>
            )}
            {showFilters ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" /> {t("clearFilters")}
            </button>
          )}
        </div>

        {/* Collapsible Filter Panel */}
        {showFilters && (
          <div className="px-4 py-3 bg-muted/20 border-b border-border/50">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Name Search */}
              <div className="field">
                <Label className="text-[11px] font-medium text-muted-foreground">{t("nameEmail")}</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    placeholder={t("searchByNameEmail")}
                    className="h-8 rounded-lg border-border bg-background pl-8 text-xs"
                  />
                </div>
              </div>

              {/* Region Filter */}
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">{t("regionCountry")}</Label>
                <SearchableSelect
                  value={filterRegion}
                  onValueChange={(val) => setFilterRegion(val)}
                  options={[
                    { value: "", label: t("allRegions") },
                    ...regionOptions.map((r) => ({ value: r, label: r })),
                  ]}
                  placeholder={t("allRegions")}
                  searchPlaceholder={t("searchRegions")}
                  emptyMessage={t("noRegionsFound")}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("showingAgents", { shown: filteredAgents.length, total: agents.length })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="workspace-glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">{t("noAgentsInTeam")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border/70">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[200px]">
                    {t("tableHeaderAgent")}
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[130px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      {t("tableHeaderEmployers")}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[130px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {t("tableHeaderEmployees")}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[140px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" />
                      {t("tableHeaderRevenue")}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[120px]">
                    {t("tableHeaderMonthly")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredAgents.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {t("noAgentsMatchFilters")}
                    </td>
                  </tr>
                ) : (
                  filteredAgents.map((agent) => {
                    const row = targetRows[agent.id];
                    if (!row) return null;
                    return (
                      <AgentTargetRow
                        key={agent.id}
                        agent={agent}
                        row={row}
                        currency={agent.currency}
                        onUpdateTarget={updateTarget}
                        onToggleMonthly={toggleMonthly}
                        onUpdateMonthly={updateMonthlyTarget}
                        monthsShort={monthsShort}
                        t={t}
                      />
                    );
                  })
                )}
              </tbody>
              {/* Totals Row */}
              <tfoot className="bg-muted/30 border-t-2 border-border">
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">
                    {t("totalAgents", { count: validRows.length })}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-foreground tabular-nums">
                    {formatCount(totals.employer)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-foreground tabular-nums">
                    {formatCount(totals.employee)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-foreground tabular-nums">
                    {formatCount(totals.finance)}
                  </td>
                  <td className="px-4 py-3 max-sm:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleCreate}
          disabled={creating || validRows.length === 0}
          className="gap-2 rounded-xl px-6"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("assignTargets", { count: validRows.length })}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Row Component                                                */
/* ------------------------------------------------------------------ */

interface AgentTargetRowProps {
  agent: AgentRow;
  row: TargetRow;
  currency: string;
  onUpdateTarget: (id: string, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => void;
  onToggleMonthly: (id: string) => void;
  onUpdateMonthly: (id: string, month: number, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => void;
  monthsShort: string[];
  t: (key: string, options?: any) => string;
}

function AgentTargetRow({
  agent,
  row,
  currency,
  onUpdateTarget,
  onToggleMonthly,
  onUpdateMonthly,
  monthsShort,
  t,
}: AgentTargetRowProps) {
  const hasTarget = row.employerTarget > 0 || row.employeeTarget > 0 || row.financeTarget > 0;

  return (
    <>
      <tr className={`transition-colors ${hasTarget ? "bg-sky-50/50" : "hover:bg-muted/20"}`}>
        {/* Agent Info */}
        <td className="px-4 py-3">
          <div className="grid w-full min-w-0 gap-1">
            <p className="font-medium text-foreground truncate">{agent.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
            {agent.territory && (
              <p className="text-[11px] text-muted-foreground truncate">{agent.territory}</p>
            )}
          </div>
        </td>

        {/* Employer Target */}
        <td className="px-4 py-3">
          <Input
            type="number"
            min={0}
            value={row.employerTarget || ""}
            onChange={(e) => onUpdateTarget(agent.id, "employerTarget", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="h-9 w-full rounded-lg border-border bg-background text-center text-sm tabular-nums"
          />
        </td>

        {/* Employee Target */}
        <td className="px-4 py-3">
          <Input
            type="number"
            min={0}
            value={row.employeeTarget || ""}
            onChange={(e) => onUpdateTarget(agent.id, "employeeTarget", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="h-9 w-full rounded-lg border-border bg-background text-center text-sm tabular-nums"
          />
        </td>

        {/* Revenue Target */}
        <td className="px-4 py-3">
          <div className="relative">
            <Input
              type="number"
              min={0}
              value={row.financeTarget || ""}
              onChange={(e) => onUpdateTarget(agent.id, "financeTarget", parseInt(e.target.value) || 0)}
              placeholder="0"
              className="h-9 w-full rounded-lg border-border bg-background text-center text-sm tabular-nums pr-12"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
              {currency}
            </span>
          </div>
        </td>

        {/* Monthly Toggle */}
        <td className="px-4 py-3 text-center">
          <Button
            type="button"
            variant={row.showMonthly ? "default" : "outline"}
            size="dense"
            className="rounded-lg text-xs gap-1"
            onClick={() => onToggleMonthly(agent.id)}
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
              agentId={agent.id}
              monthly={row.monthlyTargets}
              currency={currency}
              annualTargets={{
                employerTarget: row.employerTarget,
                employeeTarget: row.employeeTarget,
                financeTarget: row.financeTarget,
              }}
              onUpdate={onUpdateMonthly}
              monthsShort={monthsShort}
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
  monthsShort: string[];
  t: (key: string, options?: any) => string;
}

function MonthlyDistributionTable({
  agentId,
  monthly,
  currency,
  annualTargets,
  onUpdate,
  monthsShort,
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
        <p className="text-xs font-semibold text-muted-foreground">{t("monthlyDistributionEditable")}</p>
        {!isValid && (
          <Badge variant="destructive" className="text-[11px]">
            {t("sumMismatch")}
          </Badge>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Month</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">{t("tableHeaderEmployers")}</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">{t("tableHeaderEmployees")}</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">{t("tableHeaderRevenue")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {monthly.map((m) => (
              <tr key={m.month} className="hover:bg-muted/10">
                <td className="px-2 py-1.5 font-medium text-muted-foreground">{monthsShort[m.month - 1]}</td>
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
