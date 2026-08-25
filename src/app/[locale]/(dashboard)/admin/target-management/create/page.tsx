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
import { PageHeader } from "@/components/shared/PageHeader";
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

interface SupervisorRow {
  id: string;
  name: string;
  email: string;
  teamSize: number;
  territory: string;
  currency: string;
}

interface TargetRow {
  supervisorId: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  showMonthly: boolean;
  monthlyTargets: MonthlyTarget[];
}

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

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CreateTargetProfilePage() {
  const t = useTranslations("targets");
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear + 1);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  // Supervisors list
  const [supervisors, setSupervisors] = useState<SupervisorRow[]>([]);

  // Target data per supervisor
  const [targetRows, setTargetRows] = useState<Record<string, TargetRow>>({});

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterTeamSize, setFilterTeamSize] = useState<"all" | "small" | "medium" | "large">("all");

  // Fetch supervisors under admin
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          directory: "create-target",
          targetYear: String(year),
          limit: "500",
        });
        const res = await fetch(`/api/admin/super-agents?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load supervisors");
        const data = await res.json();
        const rows: SupervisorRow[] = (data.superAgents ?? data.items ?? []).map(
          (sa: {
            _id?: string;
            userId?: string;
            name?: string;
            email?: string;
            user?: { name?: string; _id?: string };
            directory?: { teamSize?: number; regionNames?: string[]; currencyCode?: string };
          }) => ({
            id: sa.userId ?? sa.user?._id ?? sa._id ?? "",
            name: sa.name ?? sa.user?.name ?? "Unknown",
            email: sa.email ?? "",
            teamSize: sa.directory?.teamSize ?? 0,
            territory: sa.directory?.regionNames?.[0] ?? "",
            currency: sa.directory?.currencyCode ?? "AED",
          })
        );
        setSupervisors(rows);

        // Initialize target rows
        const initial: Record<string, TargetRow> = {};
        for (const sup of rows) {
          initial[sup.id] = {
            supervisorId: sup.id,
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
          toast.error(t("failedToLoadSupervisors"));
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [year]);

  // Update annual target for a supervisor
  const updateTarget = useCallback((supervisorId: string, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => {
    setTargetRows((prev) => {
      const row = prev[supervisorId];
      if (!row) return prev;
      const updated = { ...row, [field]: value };
      // Regenerate monthly distribution
      updated.monthlyTargets = generateEqualDistribution({
        employerTarget: updated.employerTarget,
        employeeTarget: updated.employeeTarget,
        financeTarget: updated.financeTarget,
      });
      return { ...prev, [supervisorId]: updated };
    });
  }, []);

  // Toggle monthly distribution view
  const toggleMonthly = useCallback((supervisorId: string) => {
    setTargetRows((prev) => {
      const row = prev[supervisorId];
      if (!row) return prev;
      return { ...prev, [supervisorId]: { ...row, showMonthly: !row.showMonthly } };
    });
  }, []);

  // Update monthly target for a supervisor
  const updateMonthlyTarget = useCallback((supervisorId: string, month: number, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => {
    setTargetRows((prev) => {
      const row = prev[supervisorId];
      if (!row) return prev;
      const updatedMonthly = row.monthlyTargets.map((m) =>
        m.month === month ? { ...m, [field]: value } : m
      );
      return { ...prev, [supervisorId]: { ...row, monthlyTargets: updatedMonthly } };
    });
  }, []);

  // Derived region options
  const regionOptions = useMemo(() => {
    const regions = [...new Set(supervisors.map((s) => s.territory).filter(Boolean))].sort();
    return regions;
  }, [supervisors]);

  // Filtered supervisors
  const filteredSupervisors = useMemo(() => {
    return supervisors.filter((sup) => {
      // Name/email filter
      if (filterName.trim()) {
        const q = filterName.trim().toLowerCase();
        if (!sup.name.toLowerCase().includes(q) && !sup.email.toLowerCase().includes(q)) {
          return false;
        }
      }
      // Region filter
      if (filterRegion) {
        if (sup.territory !== filterRegion) return false;
      }
      // Team size filter
      if (filterTeamSize !== "all") {
        if (filterTeamSize === "small" && sup.teamSize > 3) return false;
        if (filterTeamSize === "medium" && (sup.teamSize < 4 || sup.teamSize > 8)) return false;
        if (filterTeamSize === "large" && sup.teamSize < 9) return false;
      }
      return true;
    });
  }, [supervisors, filterName, filterRegion, filterTeamSize]);

  const hasActiveFilters = filterName.trim() !== "" || filterRegion !== "" || filterTeamSize !== "all";

  const clearFilters = () => {
    setFilterName("");
    setFilterRegion("");
    setFilterTeamSize("all");
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
      toast.error(t("enterTargetsForSupervisors"));
      return;
    }

    setCreating(true);
    try {
      const payload = {
        assigneeIds: validRows.map((r) => r.supervisorId),
        assigneeRole: "super_agent" as const,
        year,
        targets: validRows.map((row) => {
          const sup = supervisors.find((s) => s.id === row.supervisorId);
          return {
            assigneeId: row.supervisorId,
            employerTarget: row.employerTarget,
            employeeTarget: row.employeeTarget,
            financeTarget: row.financeTarget,
            currency: sup?.currency ?? "AED",
            distributionStrategy: "custom" as const,
            monthlyTargets: row.monthlyTargets,
          };
        }),
      };

      const res = await csrfFetch("/api/admin/target-profiles?action=bulk-tabular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const created = Number(data.created ?? 0);
        toast.success(`${created} target profile${created !== 1 ? "s" : ""} created successfully`);
        router.push(`/${locale}/admin/target-management?year=${year}`);
      } else {
        toast.error(data.error ?? t("failedToCreateProfiles"));
      }
    } catch {
      toast.error(t("failedToCreateProfiles"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-container max-w-6xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.push(`/${locale}/admin/target-management`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Target Management
      </button>

      {/* Header */}
      <div className="workspace-glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="workspace-tone-sky rounded-xl p-2.5">
              <Target className="h-5 w-5" />
            </div>
            <PageHeader title="Create Target Profiles" description="Set annual targets for supervisors in a tabular format" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || currentYear)}
                className="h-9 w-20 rounded-lg border-border bg-card text-center text-sm"
              />
            </div>
          </div>
        </div>
      </div>

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
            Filters
            {hasActiveFilters && (
              <Badge variant="info" className="text-[10px] px-1.5 py-0">
                {[filterName, filterRegion, filterTeamSize !== "all" ? filterTeamSize : ""].filter(Boolean).length}
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
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {/* Collapsible Filter Panel */}
        {showFilters && (
          <div className="px-4 py-3 bg-muted/20 border-b border-border/50">
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Name Search */}
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Name / Email</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    placeholder="Search by name or email..."
                    className="h-8 rounded-lg border-border bg-background pl-8 text-xs"
                  />
                </div>
              </div>

              {/* Region Filter */}
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Region</Label>
                <SearchableSelect
                  value={filterRegion}
                  onValueChange={(val) => setFilterRegion(val)}
                  options={[
                    { value: "", label: "All regions" },
                    ...regionOptions.map((r) => ({ value: r, label: r })),
                  ]}
                  placeholder="All regions"
                  searchPlaceholder="Search regions..."
                  emptyMessage="No regions found"
                  className="h-8 text-xs"
                />
              </div>

              {/* Team Size Filter */}
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Team Size</Label>
                <SearchableSelect
                  value={filterTeamSize}
                  onValueChange={(val) => setFilterTeamSize(val as "all" | "small" | "medium" | "large")}
                  options={[
                    { value: "all", label: "All sizes" },
                    { value: "small", label: "Small (1–3)" },
                    { value: "medium", label: "Medium (4–8)" },
                    { value: "large", label: "Large (9+)" },
                  ]}
                  placeholder="All sizes"
                  searchPlaceholder="Search sizes..."
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Showing {filteredSupervisors.length} of {supervisors.length} supervisors
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="workspace-glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-auto h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : supervisors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No supervisors found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border/70">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[200px]">
                    Supervisor
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[130px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Employers
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[130px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Employees
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[140px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" />
                      Revenue
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[120px]">
                    Monthly
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredSupervisors.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No supervisors match the current filters
                    </td>
                  </tr>
                ) : (
                  filteredSupervisors.map((sup) => {
                    const row = targetRows[sup.id];
                    if (!row) return null;
                    return (
                      <SupervisorTargetRow
                        key={sup.id}
                        supervisor={sup}
                        row={row}
                        currency={sup.currency}
                        onUpdateTarget={updateTarget}
                        onToggleMonthly={toggleMonthly}
                        onUpdateMonthly={updateMonthlyTarget}
                      />
                    );
                  })
                )}
              </tbody>
              {/* Totals Row */}
              <tfoot className="bg-muted/30 border-t-2 border-border">
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">
                    Total ({validRows.length} supervisor{validRows.length !== 1 ? "s" : ""})
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
                  <td className="px-4 py-3" />
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
          Create Targets ({validRows.length})
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Supervisor Row Component                                           */
/* ------------------------------------------------------------------ */

interface SupervisorTargetRowProps {
  supervisor: SupervisorRow;
  row: TargetRow;
  currency: string;
  onUpdateTarget: (id: string, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => void;
  onToggleMonthly: (id: string) => void;
  onUpdateMonthly: (id: string, month: number, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => void;
}

function SupervisorTargetRow({
  supervisor,
  row,
  currency,
  onUpdateTarget,
  onToggleMonthly,
  onUpdateMonthly,
}: SupervisorTargetRowProps) {
  const hasTarget = row.employerTarget > 0 || row.employeeTarget > 0 || row.financeTarget > 0;

  return (
    <>
      <tr className={`transition-colors ${hasTarget ? "bg-sky-50/50" : "hover:bg-muted/20"}`}>
        {/* Supervisor Info */}
        <td className="px-4 py-3">
          <div>
            <p className="font-medium text-foreground">{supervisor.name}</p>
            <p className="text-[11px] text-muted-foreground">{supervisor.email}</p>
            {supervisor.territory && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{supervisor.territory}</p>
            )}
          </div>
        </td>

        {/* Employer Target */}
        <td className="px-4 py-3">
          <Input
            type="number"
            min={0}
            value={row.employerTarget || ""}
            onChange={(e) => onUpdateTarget(supervisor.id, "employerTarget", parseInt(e.target.value) || 0)}
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
            onChange={(e) => onUpdateTarget(supervisor.id, "employeeTarget", parseInt(e.target.value) || 0)}
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
              onChange={(e) => onUpdateTarget(supervisor.id, "financeTarget", parseInt(e.target.value) || 0)}
              placeholder="0"
              className="h-9 w-full rounded-lg border-border bg-background text-center text-sm tabular-nums pr-12"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">
              {currency}
            </span>
          </div>
        </td>

        {/* Monthly Toggle */}
        <td className="px-4 py-3 text-center">
          <Button
            type="button"
            variant={row.showMonthly ? "default" : "outline"}
            size="sm"
            className="rounded-lg h-8 text-xs gap-1"
            onClick={() => onToggleMonthly(supervisor.id)}
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
              supervisorId={supervisor.id}
              monthly={row.monthlyTargets}
              currency={currency}
              annualTargets={{
                employerTarget: row.employerTarget,
                employeeTarget: row.employeeTarget,
                financeTarget: row.financeTarget,
              }}
              onUpdate={onUpdateMonthly}
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
  supervisorId: string;
  monthly: MonthlyTarget[];
  currency: string;
  annualTargets: { employerTarget: number; employeeTarget: number; financeTarget: number };
  onUpdate: (supervisorId: string, month: number, field: "employerTarget" | "employeeTarget" | "financeTarget", value: number) => void;
}

function MonthlyDistributionTable({
  supervisorId,
  monthly,
  currency,
  annualTargets,
  onUpdate,
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
        <p className="text-xs font-semibold text-muted-foreground">Monthly Distribution (editable)</p>
        {!isValid && (
          <Badge variant="destructive" className="text-[10px]">
            Sum mismatch — adjust monthly values
          </Badge>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Month</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Employers</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Employees</th>
              <th className="px-2 py-2 text-center font-semibold text-muted-foreground">Revenue</th>
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
                    onChange={(e) => onUpdate(supervisorId, m.month, "employerTarget", parseInt(e.target.value) || 0)}
                    className="h-7 w-full rounded border-border/60 bg-background text-center text-xs tabular-nums"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    value={m.employeeTarget || ""}
                    onChange={(e) => onUpdate(supervisorId, m.month, "employeeTarget", parseInt(e.target.value) || 0)}
                    className="h-7 w-full rounded border-border/60 bg-background text-center text-xs tabular-nums"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    value={m.financeTarget || ""}
                    onChange={(e) => onUpdate(supervisorId, m.month, "financeTarget", parseInt(e.target.value) || 0)}
                    className="h-7 w-full rounded border-border/60 bg-background text-center text-xs tabular-nums"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/20 border-t border-border">
            <tr>
              <td className="px-2 py-1.5 font-semibold">Total</td>
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
