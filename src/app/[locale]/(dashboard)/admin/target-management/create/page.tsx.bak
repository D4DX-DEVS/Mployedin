"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  TargetTypeIcon, QuarterlyBreakdownGrid,
} from "@/components/features/targets/TargetComponents";
import {
  ArrowLeft, ArrowRight, Check, Building2, Users, DollarSign,
  CalendarDays, MapPin, ChevronDown, ChevronUp,
  Eye, Target, Loader2, Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyTarget {
  month: number;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type DirectoryAvailability = "available" | "has_active_target" | "inactive";
type DirectoryRisk = "high" | "medium" | "low";
type SelectionMode = "single" | "bulk" | "region";
type DirectorySort = "recommended" | "performance" | "team" | "name";

interface SupervisorTargetProfileSummary {
  id: string;
  year: number;
  region?: string;
  overallProgress: number;
  riskScore: DirectoryRisk;
}

interface SupervisorDirectoryRow {
  value: string;
  label: string;
  email: string;
  isActive: boolean;
  teamSize: number;
  regionNames: string[];
  availability: DirectoryAvailability;
  availabilityReason: string | null;
  targetProfile: SupervisorTargetProfileSummary | null;
}

interface SupervisorDirectoryTotals {
  matchingSupervisors: number;
  totalTeamSize: number;
  withActiveTarget: number;
  highRiskProfiles: number;
}

const EMPTY_DIRECTORY_TOTALS: SupervisorDirectoryTotals = {
  matchingSupervisors: 0,
  totalTeamSize: 0,
  withActiveTarget: 0,
  highRiskProfiles: 0,
};

function availabilityLabel(availability: DirectoryAvailability): string {
  if (availability === "available") return "Available";
  if (availability === "has_active_target") return "Already targeted";
  return "Inactive";
}

function canSelectSupervisor(supervisor: SupervisorDirectoryRow): boolean {
  return supervisor.availability === "available";
}

function SupervisorSummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="workspace-glass-panel rounded-xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function AvailabilityBadge({ availability }: { availability: DirectoryAvailability }) {
  const variant = availability === "available"
    ? "success"
    : availability === "has_active_target"
      ? "warning"
      : "destructive";

  return <Badge variant={variant}>{availabilityLabel(availability)}</Badge>;
}

function RiskBadge({ risk }: { risk?: DirectoryRisk | null }) {
  if (!risk) {
    return <Badge variant="outline">No profile</Badge>;
  }

  const variant = risk === "high"
    ? "destructive"
    : risk === "medium"
      ? "warning"
      : "success";

  return <Badge variant={variant}>{risk} risk</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Simplified 2-Step Indicator                                        */
/* ------------------------------------------------------------------ */

function StepIndicator({ step }: { step: number }) {
  const labels = ["Setup", "Review & Create"];
  return (
    <div className="flex items-center gap-3">
      {labels.map((label, i) => {
        const s = i + 1;
        const isActive = s === step;
        const isComplete = s < step;
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
              isComplete ? "bg-emerald-500 text-white" :
              isActive ? "bg-sky-600 text-white ring-4 ring-sky-500/20" :
              "bg-muted text-muted-foreground"
            }`}>
              {isComplete ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
            {s < 2 && <div className={`h-px w-8 sm:w-16 ${s < step ? "bg-emerald-500" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
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

  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);

  // Supervisor selection
  const [superAgents, setSuperAgents] = useState<SupervisorDirectoryRow[]>([]);
  const [selectedSupervisorDetails, setSelectedSupervisorDetails] = useState<Record<string, SupervisorDirectoryRow>>({});
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryTotals, setDirectoryTotals] = useState<SupervisorDirectoryTotals>(EMPTY_DIRECTORY_TOTALS);
  const [directoryTotalCount, setDirectoryTotalCount] = useState(0);
  const [territoryOptions, setTerritoryOptions] = useState<string[]>([]);
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | DirectoryAvailability>("available");
  const [riskFilter, setRiskFilter] = useState<"all" | DirectoryRisk>("all");
  const [territoryFilter, setTerritoryFilter] = useState("all");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("single");
  const [sortBy, setSortBy] = useState<DirectorySort>("recommended");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [year, setYear] = useState(currentYear);
  const [region, setRegion] = useState("");

  // Targets
  const [employerTarget, setEmployerTarget] = useState(0);
  const [employeeTarget, setEmployeeTarget] = useState(0);
  const [financeTarget, setFinanceTarget] = useState(0);
  const [currency, setCurrency] = useState("AED");

  // Distribution
  const [strategy, setStrategy] = useState<"equal" | "custom" | "seasonal">("equal");
  const [monthlyTargets, setMonthlyTargets] = useState<MonthlyTarget[]>([]);

  useEffect(() => {
    setSelectedAgents([]);
    setSelectedSupervisorDetails({});
  }, [year]);

  // Fetch super agents
  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;
    const params = new URLSearchParams({
      directory: "create-target",
      targetYear: String(year),
      limit: "500",
    });

    if (directorySearch.trim()) params.set("search", directorySearch.trim());
    if (availabilityFilter !== "all") params.set("availability", availabilityFilter);
    if (riskFilter !== "all") params.set("riskScore", riskFilter);
    if (territoryFilter !== "all") params.set("region", territoryFilter);

    (async () => {
      setDirectoryLoading(true);
      setSuperAgents([]);
      setDirectoryTotals(EMPTY_DIRECTORY_TOTALS);
      try {
        const res = await fetch(`/api/admin/super-agents?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error("Failed to load supervisor directory");
        }

        const data = await res.json();
        if (!isCurrent) return;

        if (res.ok) {
          const nextRows = (data.superAgents ?? data.items ?? []).map(
            (sa: {
              _id?: string;
              userId?: string;
              name?: string;
              email?: string;
              isActive?: boolean;
              user?: { name?: string; _id?: string };
              directory?: {
                teamSize?: number;
                regionNames?: string[];
                availability?: DirectoryAvailability;
                availabilityReason?: string | null;
                targetProfile?: SupervisorTargetProfileSummary | null;
              };
            }) => ({
              value: sa.userId ?? sa.user?._id ?? sa._id ?? "",
              label: sa.name ?? sa.user?.name ?? "Unknown",
              email: sa.email ?? "",
              isActive: sa.isActive !== false,
              teamSize: sa.directory?.teamSize ?? 0,
              regionNames: sa.directory?.regionNames ?? [],
              availability: sa.directory?.availability ?? (sa.isActive === false ? "inactive" : "available"),
              availabilityReason: sa.directory?.availabilityReason ?? null,
              targetProfile: sa.directory?.targetProfile ?? null,
            })
          );

          setSuperAgents(nextRows);
          setTerritoryOptions(data.directoryFilters?.regions ?? []);
          setDirectoryTotals(data.directoryTotals ?? {
            matchingSupervisors: nextRows.length,
            totalTeamSize: nextRows.reduce((sum: number, agent: SupervisorDirectoryRow) => sum + agent.teamSize, 0),
            withActiveTarget: nextRows.filter((agent: SupervisorDirectoryRow) => agent.targetProfile).length,
            highRiskProfiles: nextRows.filter((agent: SupervisorDirectoryRow) => agent.targetProfile?.riskScore === "high").length,
          });
          setDirectoryTotalCount(data.pagination?.total ?? nextRows.length);
        }
      } catch {
        if (!controller.signal.aborted && isCurrent) {
          setSuperAgents([]);
          setDirectoryTotals(EMPTY_DIRECTORY_TOTALS);
          setDirectoryTotalCount(0);
          setTerritoryOptions([]);
          toast.error("Failed to load supervisor directory");
        }
      }
      finally {
        if (isCurrent) {
          setDirectoryLoading(false);
        }
      }
    })();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [availabilityFilter, directorySearch, riskFilter, territoryFilter, year]);

  useEffect(() => {
    setSelectedAgents((prev) => {
      const next = selectionMode === "single" ? prev.slice(0, 1) : prev;

      if (next.length === prev.length) {
        return prev;
      }

      setSelectedSupervisorDetails((current) => {
        const allowed = new Set(next);
        return Object.fromEntries(
          Object.entries(current).filter(([agentId]) => allowed.has(agentId))
        );
      });

      return next;
    });
  }, [selectionMode]);

  useEffect(() => {
    if (territoryFilter !== "all" && !territoryOptions.includes(territoryFilter)) {
      setTerritoryFilter("all");
    }
  }, [territoryFilter, territoryOptions]);

  const filteredSuperAgents = useMemo(() => {
    const availabilityRank: Record<DirectoryAvailability, number> = {
      available: 0,
      has_active_target: 1,
      inactive: 2,
    };
    const riskRank: Record<DirectoryRisk, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return [...superAgents]
      .sort((left, right) => {
        if (sortBy === "performance") {
          return (right.targetProfile?.overallProgress ?? -1) - (left.targetProfile?.overallProgress ?? -1)
            || left.label.localeCompare(right.label);
        }
        if (sortBy === "team") {
          return right.teamSize - left.teamSize || left.label.localeCompare(right.label);
        }
        if (sortBy === "name") {
          return left.label.localeCompare(right.label);
        }

        const availabilityDelta = availabilityRank[left.availability] - availabilityRank[right.availability];
        if (availabilityDelta !== 0) return availabilityDelta;

        const leftRisk = left.targetProfile?.riskScore;
        const rightRisk = right.targetProfile?.riskScore;
        if (leftRisk && rightRisk && leftRisk !== rightRisk) {
          return riskRank[leftRisk] - riskRank[rightRisk];
        }

        return left.label.localeCompare(right.label);
      });
  }, [sortBy, superAgents]);

  const selectedSupervisorRows = useMemo(
    () => selectedAgents.map((agentId) => selectedSupervisorDetails[agentId]).filter((agent): agent is SupervisorDirectoryRow => Boolean(agent)),
    [selectedAgents, selectedSupervisorDetails]
  );

  const visibleSelectableIds = useMemo(
    () => filteredSuperAgents.filter(canSelectSupervisor).map((agent) => agent.value),
    [filteredSuperAgents]
  );

  const toggleSupervisorSelection = (agentId: string, checked?: boolean) => {
    const supervisor = superAgents.find((candidate) => candidate.value === agentId);
    if (!supervisor || !canSelectSupervisor(supervisor)) return;

    setSelectedAgents((prev) => {
      const isSelected = prev.includes(agentId);
      const nextChecked = typeof checked === "boolean" ? checked : !isSelected;

      let nextSelection: string[];

      if (selectionMode === "single") {
        nextSelection = nextChecked ? [agentId] : [];
      } else if (nextChecked) {
        nextSelection = isSelected ? prev : [...prev, agentId];
      } else {
        nextSelection = prev.filter((currentId) => currentId !== agentId);
      }

      setSelectedSupervisorDetails((current) => {
        const nextDetails = { ...current };
        if (nextChecked) {
          nextDetails[agentId] = supervisor;
        } else {
          delete nextDetails[agentId];
        }

        if (selectionMode === "single" && nextChecked) {
          return { [agentId]: supervisor };
        }

        return nextDetails;
      });

      return nextSelection;
    });
  };

  const selectVisibleSupervisors = () => {
    if (selectionMode === "single") {
      const firstVisibleId = visibleSelectableIds[0];
      setSelectedAgents(firstVisibleId ? [firstVisibleId] : []);
      setSelectedSupervisorDetails(() => {
        const supervisor = superAgents.find((agent) => agent.value === firstVisibleId);
        return supervisor ? { [supervisor.value]: supervisor } : {};
      });
      return;
    }

    setSelectedAgents((prev) => {
      const nextSelection = Array.from(new Set([...prev, ...visibleSelectableIds]));
      setSelectedSupervisorDetails((current) => {
        const nextDetails = { ...current };
        filteredSuperAgents
          .filter((agent) => visibleSelectableIds.includes(agent.value))
          .forEach((agent) => {
            nextDetails[agent.value] = agent;
          });
        return nextDetails;
      });
      return nextSelection;
    });
  };

  // Generate monthly distribution
  const generateDistribution = useCallback(() => {
    if (strategy === "equal") {
      return Array.from({ length: 12 }, (_, i) => {
        const empPer = Math.floor(employerTarget / 12);
        const empRem = employerTarget - empPer * 12;
        const emplPer = Math.floor(employeeTarget / 12);
        const emplRem = employeeTarget - emplPer * 12;
        const finPer = Math.floor(financeTarget / 12);
        const finRem = financeTarget - finPer * 12;
        return {
          month: i + 1,
          employerTarget: empPer + (i < empRem ? 1 : 0),
          employeeTarget: emplPer + (i < emplRem ? 1 : 0),
          financeTarget: finPer + (i < finRem ? 1 : 0),
        };
      });
    }
    if (strategy === "seasonal") {
      const qWeights = [0.30, 0.20, 0.30, 0.20];
      const monthWeights = qWeights.flatMap((qw) => [qw / 3, qw / 3, qw / 3]);
      const months = monthWeights.map((w, i) => ({
        month: i + 1,
        employerTarget: Math.round(employerTarget * w),
        employeeTarget: Math.round(employeeTarget * w),
        financeTarget: Math.round(financeTarget * w),
      }));
      const empSum = months.reduce((s, m) => s + m.employerTarget, 0);
      const emplSum = months.reduce((s, m) => s + m.employeeTarget, 0);
      const finSum = months.reduce((s, m) => s + m.financeTarget, 0);
      months[11].employerTarget += employerTarget - empSum;
      months[11].employeeTarget += employeeTarget - emplSum;
      months[11].financeTarget += financeTarget - finSum;
      return months;
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      employerTarget: Math.floor(employerTarget / 12) + (i < (employerTarget % 12) ? 1 : 0),
      employeeTarget: Math.floor(employeeTarget / 12) + (i < (employeeTarget % 12) ? 1 : 0),
      financeTarget: Math.floor(financeTarget / 12) + (i < (financeTarget % 12) ? 1 : 0),
    }));
  }, [strategy, employerTarget, employeeTarget, financeTarget]);

  // Auto-generate distribution when moving to review
  useEffect(() => {
    if (step === 2) {
      setMonthlyTargets(generateDistribution());
    }
  }, [step, generateDistribution]);

  // Quarterly view
  const quarterlyBreakdown = useMemo(() => {
    const quarters = [
      { label: "Q1", months: [1, 2, 3] },
      { label: "Q2", months: [4, 5, 6] },
      { label: "Q3", months: [7, 8, 9] },
      { label: "Q4", months: [10, 11, 12] },
    ];
    return quarters.map((q) => {
      const qMonths = monthlyTargets.filter((m) => q.months.includes(m.month));
      return {
        label: q.label,
        employerTarget: qMonths.reduce((s, m) => s + m.employerTarget, 0),
        employeeTarget: qMonths.reduce((s, m) => s + m.employeeTarget, 0),
        financeTarget: qMonths.reduce((s, m) => s + m.financeTarget, 0),
      };
    });
  }, [monthlyTargets]);

  const monthlySum = useMemo(() => ({
    employer: monthlyTargets.reduce((s, m) => s + m.employerTarget, 0),
    employee: monthlyTargets.reduce((s, m) => s + m.employeeTarget, 0),
    finance: monthlyTargets.reduce((s, m) => s + m.financeTarget, 0),
  }), [monthlyTargets]);

  const sumValid =
    monthlySum.employer === employerTarget &&
    monthlySum.employee === employeeTarget &&
    monthlySum.finance === financeTarget;

  // Can proceed to review?
  const canProceed = selectedAgents.length > 0 && year > 0 &&
    (employerTarget > 0 || employeeTarget > 0 || financeTarget > 0);

  const handleCreate = async () => {
    if (selectedAgents.length === 0) {
      toast.error("Select at least one supervisor before creating a target profile");
      setStep(1);
      return;
    }

    // Re-generate distribution to ensure it's fresh
    const finalMonthly = generateDistribution();

    setCreating(true);
    try {
      const isBulk = selectedAgents.length > 1;
      const url = isBulk ? "/api/admin/target-profiles?action=bulk" : "/api/admin/target-profiles";
      const body = isBulk
        ? {
            assigneeIds: selectedAgents,
            assigneeRole: "super_agent",
            year,
            region: region || undefined,
            employerTarget,
            employeeTarget,
            financeTarget,
            currency,
            distributionStrategy: strategy,
            monthlyTargets: finalMonthly,
            notes: "",
          }
        : {
            assigneeId: selectedAgents[0],
            assigneeRole: "super_agent",
            year,
            region: region || undefined,
            employerTarget,
            employeeTarget,
            financeTarget,
            currency,
            distributionStrategy: strategy,
            monthlyTargets: finalMonthly,
          };

      const res = await csrfFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (isBulk) {
          const created = Number(data.created ?? data.profiles?.length ?? 0);
          const skipped = Math.max(0, selectedAgents.length - created);

          if (created === 0) {
            toast.error(`No target profiles were created. The selected supervisors may already have active ${year} profiles.`);
            return;
          }

          toast.success(
            skipped > 0
              ? `${created} target profiles created. ${skipped} supervisor${skipped === 1 ? " was" : "s were"} skipped because an active ${year} profile already exists.`
              : `${created} target profiles created successfully`
          );
        } else {
          toast.success("Target profile created successfully");
        }
        router.push(`/${locale}/admin/target-management?year=${year}`);
      } else {
        toast.error(data.error ?? "Failed to create");
      }
    } catch {
      toast.error("Failed to create target profile");
    } finally {
      setCreating(false);
    }
  };

  const updateMonthly = (month: number, field: keyof MonthlyTarget, value: number) => {
    setMonthlyTargets((prev) =>
      prev.map((m) => (m.month === month ? { ...m, [field]: value } : m))
    );
  };

  return (
    <div className="page-container max-w-5xl mx-auto space-y-5">
      {/* Back */}
      <button
        onClick={() => router.push(`/${locale}/admin/target-management`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Target Management
      </button>

      {/* Header — compact */}
      <div className="workspace-glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="workspace-tone-sky rounded-xl p-2.5">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Create Target Profile</h1>
              <p className="text-xs text-muted-foreground">
                Assign supervisor, set targets, and you&apos;re done
              </p>
            </div>
          </div>
          <StepIndicator step={step} />
        </div>
      </div>

      {/* ============= STEP 1: SETUP (All-in-one) ============= */}
      {step === 1 && (
        <div className="space-y-5">

          {/* --- Section A: Year & Region (inline) --- */}
          <div className="workspace-glass-panel rounded-2xl p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Planning Year *</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value) || currentYear)}
                    className="h-10 rounded-xl border-border bg-card pl-9"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Target Region</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="e.g. Dubai, Abu Dhabi"
                    className="h-10 rounded-xl border-border bg-card pl-9"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Currency</Label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                  maxLength={3}
                  className="h-10 rounded-xl border-border bg-card text-center font-semibold"
                />
              </div>
            </div>
          </div>

          {/* --- Section B: Supervisor Selection --- */}
          <div className="workspace-glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-600" />
                <h2 className="text-sm font-semibold">Select Supervisor</h2>
                {selectedAgents.length > 0 && (
                  <Badge variant="info" className="ml-2">{selectedAgents.length} selected</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {([
                  { key: "single", label: "Individual" },
                  { key: "bulk", label: "Bulk" },
                  { key: "region", label: "Region" },
                ] as const).map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setSelectionMode(mode.key)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${selectionMode === mode.key ? "border-sky-500 bg-sky-500/10 text-sky-700" : "border-border text-muted-foreground hover:border-border/80"}`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search + Filters — compact row */}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder="Search supervisor, email, or territory..."
                  className="h-9 rounded-lg border-border bg-background pl-9 text-sm"
                />
              </div>
              <SearchableSelect
                options={[
                  { value: "all", label: "All" },
                  { value: "available", label: "Available" },
                  { value: "has_active_target", label: "Targeted" },
                  { value: "inactive", label: "Inactive" },
                ]}
                value={availabilityFilter}
                onValueChange={(value) => setAvailabilityFilter(value as "all" | DirectoryAvailability)}
                className="h-9 rounded-lg border-border bg-background text-xs w-[120px]"
              />
              {territoryOptions.length > 0 && (
                <SearchableSelect
                  options={[
                    { value: "all", label: "All territories" },
                    ...territoryOptions.map((territory) => ({ value: territory, label: territory })),
                  ]}
                  value={territoryFilter}
                  onValueChange={setTerritoryFilter}
                  className="h-9 rounded-lg border-border bg-background text-xs w-[140px]"
                />
              )}
              <SearchableSelect
                options={[
                  { value: "recommended", label: "Recommended" },
                  { value: "performance", label: "Performance" },
                  { value: "team", label: "Team size" },
                  { value: "name", label: "Name" },
                ]}
                value={sortBy}
                onValueChange={(value) => setSortBy(value as DirectorySort)}
                className="h-9 rounded-lg border-border bg-background text-xs w-[130px]"
              />
            </div>

            {/* Selection actions */}
            {selectionMode !== "single" && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg h-7 text-xs"
                  onClick={selectVisibleSupervisors}
                  disabled={visibleSelectableIds.length === 0 || (selectionMode === "region" && territoryFilter === "all")}
                >
                  Select All Visible
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-lg h-7 text-xs"
                  onClick={() => { setSelectedAgents([]); setSelectedSupervisorDetails({}); }}
                  disabled={selectedAgents.length === 0}
                >
                  Clear
                </Button>
              </div>
            )}

            {/* Selected badges */}
            {selectedSupervisorRows.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedSupervisorRows.slice(0, 5).map((agent) => (
                  <Badge key={agent.value} variant="info" className="px-2 py-1 text-[11px]">
                    {agent.label}
                  </Badge>
                ))}
                {selectedSupervisorRows.length > 5 && (
                  <Badge variant="outline" className="px-2 py-1 text-[11px]">+{selectedSupervisorRows.length - 5} more</Badge>
                )}
              </div>
            )}

            {/* Supervisor Table — compact */}
            <div className="hidden lg:block overflow-hidden rounded-xl border border-border/70 bg-background max-h-[360px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/35 sticky top-0">
                  <tr>
                    <th className="w-12 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"></th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supervisor</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Territory</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {directoryLoading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index} className="border-t border-border/60">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="h-8 animate-pulse rounded-lg bg-muted/50" />
                        </td>
                      </tr>
                    ))
                  ) : filteredSuperAgents.length === 0 ? (
                    <tr className="border-t border-border/60">
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No supervisors match the current filters.</td>
                    </tr>
                  ) : (
                    filteredSuperAgents.map((agent) => {
                      const selected = selectedAgents.includes(agent.value);
                      const selectable = canSelectSupervisor(agent);

                      return (
                        <tr
                          key={agent.value}
                          onClick={() => selectable && toggleSupervisorSelection(agent.value)}
                          className={`border-t border-border/40 transition-colors ${selectable ? "cursor-pointer hover:bg-sky-500/[0.04]" : "cursor-not-allowed opacity-50"} ${selected ? "bg-sky-500/[0.07]" : ""}`}
                        >
                          <td className="px-3 py-2.5">
                            {selectionMode === "single" ? (
                              <div className={`h-4 w-4 rounded-full border-2 ${selected ? "border-sky-500 bg-sky-500" : "border-border"}`}>
                                {selected && <Check className="h-3 w-3 text-white" />}
                              </div>
                            ) : (
                              <div onClick={(event) => event.stopPropagation()}>
                                <Checkbox
                                  checked={selected}
                                  disabled={!selectable}
                                  onCheckedChange={(checked) => toggleSupervisorSelection(agent.value, checked === true)}
                                />
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="text-sm font-medium text-foreground">{agent.label}</p>
                            <p className="text-[11px] text-muted-foreground">{agent.email || ""}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {agent.regionNames.length > 0 ? agent.regionNames.slice(0, 2).map((territory) => (
                                <span key={territory} className="text-[11px] text-muted-foreground">{territory}</span>
                              )) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-sm font-medium tabular-nums">{agent.teamSize}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <AvailabilityBadge availability={agent.availability} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-2 lg:hidden max-h-[400px] overflow-y-auto">
              {directoryLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-muted/50" />
                ))
              ) : filteredSuperAgents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No supervisors match.</div>
              ) : (
                filteredSuperAgents.map((agent) => {
                  const selected = selectedAgents.includes(agent.value);
                  const selectable = canSelectSupervisor(agent);

                  return (
                    <div
                      key={agent.value}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectable && toggleSupervisorSelection(agent.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectable && toggleSupervisorSelection(agent.value); } }}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${selected ? "border-sky-500 bg-sky-500/[0.05]" : "border-border bg-background"} ${selectable ? "cursor-pointer hover:border-border/80" : "opacity-60"}`}
                    >
                      {selectionMode === "single" ? (
                        <div className={`h-4 w-4 shrink-0 rounded-full border-2 ${selected ? "border-sky-500 bg-sky-500" : "border-border"}`}>
                          {selected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      ) : (
                        <Checkbox checked={selected} disabled={!selectable} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{agent.label}</p>
                        <p className="text-[11px] text-muted-foreground">Team: {agent.teamSize} · {agent.regionNames[0] || "No territory"}</p>
                      </div>
                      <AvailabilityBadge availability={agent.availability} />
                    </div>
                  );
                })
              )}
            </div>

            {directoryTotalCount > superAgents.length && (
              <p className="text-xs text-muted-foreground">
                Showing {superAgents.length} of {directoryTotalCount}. Refine search to see more.
              </p>
            )}
          </div>

          {/* --- Section C: Annual Targets --- */}
          <div className="workspace-glass-panel rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold">Annual Targets</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <TargetTypeIcon type="employer" size="sm" />
                  <Label className="text-xs font-medium text-muted-foreground">Employers</Label>
                </div>
                <Input
                  type="number"
                  value={employerTarget || ""}
                  onChange={(e) => setEmployerTarget(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 1200"
                  className="h-10 rounded-xl border-border bg-card text-base font-semibold"
                />
                <p className="text-[11px] text-muted-foreground">Companies to acquire</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <TargetTypeIcon type="employee" size="sm" />
                  <Label className="text-xs font-medium text-muted-foreground">Employees</Label>
                </div>
                <Input
                  type="number"
                  value={employeeTarget || ""}
                  onChange={(e) => setEmployeeTarget(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 5000"
                  className="h-10 rounded-xl border-border bg-card text-base font-semibold"
                />
                <p className="text-[11px] text-muted-foreground">Placements this year</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <TargetTypeIcon type="finance" size="sm" />
                  <Label className="text-xs font-medium text-muted-foreground">Revenue ({currency})</Label>
                </div>
                <Input
                  type="number"
                  value={financeTarget || ""}
                  onChange={(e) => setFinanceTarget(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 5000000"
                  className="h-10 rounded-xl border-border bg-card text-base font-semibold"
                />
                <p className="text-[11px] text-muted-foreground">Revenue target</p>
              </div>
            </div>
          </div>

          {/* --- Section D: Distribution (collapsible advanced) --- */}
          <div className="workspace-glass-panel rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDistribution(!showDistribution)}
              className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold">Monthly Distribution</span>
                <Badge variant="outline" className="text-[10px] capitalize">{strategy}</Badge>
              </div>
              {showDistribution ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {showDistribution && (
              <div className="border-t border-border/60 p-5 space-y-4">
                {/* Strategy picker */}
                <div className="grid grid-cols-3 gap-2">
                  {(["equal", "seasonal", "custom"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setStrategy(s); setMonthlyTargets(generateDistribution()); }}
                      className={`rounded-lg border p-2.5 text-left transition-all ${
                        strategy === s
                          ? "border-sky-500 bg-sky-500/5 ring-1 ring-sky-500/20"
                          : "border-border hover:border-border/80"
                      }`}
                    >
                      <p className="text-xs font-semibold capitalize">{s}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {s === "equal" ? "Even split across months" :
                         s === "seasonal" ? "Q1 & Q3 higher (30/20/30/20)" :
                         "Edit each month manually"}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Monthly grid — compact */}
                {(employerTarget > 0 || employeeTarget > 0 || financeTarget > 0) && (
                  <div className="overflow-x-auto rounded-lg border border-border/50">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="px-2.5 py-2 text-left font-semibold text-muted-foreground">Month</th>
                          <th className="px-2.5 py-2 text-right font-semibold text-muted-foreground">Employer</th>
                          <th className="px-2.5 py-2 text-right font-semibold text-muted-foreground">Employee</th>
                          <th className="px-2.5 py-2 text-right font-semibold text-muted-foreground">Finance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(monthlyTargets.length > 0 ? monthlyTargets : generateDistribution()).map((m) => (
                          <tr key={m.month} className="border-t border-border/30">
                            <td className="px-2.5 py-1.5 font-medium">{MONTHS_SHORT[m.month - 1]}</td>
                            <td className="px-2.5 py-1.5 text-right">
                              {strategy === "custom" ? (
                                <Input
                                  type="number"
                                  value={m.employerTarget || ""}
                                  onChange={(e) => updateMonthly(m.month, "employerTarget", parseInt(e.target.value) || 0)}
                                  className="h-6 w-16 ml-auto rounded text-right text-xs tabular-nums"
                                />
                              ) : (
                                <span className="tabular-nums">{m.employerTarget}</span>
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 text-right">
                              {strategy === "custom" ? (
                                <Input
                                  type="number"
                                  value={m.employeeTarget || ""}
                                  onChange={(e) => updateMonthly(m.month, "employeeTarget", parseInt(e.target.value) || 0)}
                                  className="h-6 w-16 ml-auto rounded text-right text-xs tabular-nums"
                                />
                              ) : (
                                <span className="tabular-nums">{m.employeeTarget}</span>
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 text-right">
                              {strategy === "custom" ? (
                                <Input
                                  type="number"
                                  value={m.financeTarget || ""}
                                  onChange={(e) => updateMonthly(m.month, "financeTarget", parseInt(e.target.value) || 0)}
                                  className="h-6 w-20 ml-auto rounded text-right text-xs tabular-nums"
                                />
                              ) : (
                                <span className="tabular-nums">{m.financeTarget.toLocaleString()}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* --- Proceed button --- */}
          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={!canProceed}
              className="rounded-xl gap-2 bg-sky-600 hover:bg-sky-700 px-6"
            >
              Review & Create <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ============= STEP 2: REVIEW & CREATE ============= */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="workspace-glass-panel rounded-2xl p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold">Review & Create</h2>
            </div>

            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assignment</p>
                <p className="text-sm font-medium">
                  {selectedAgents.length} supervisor{selectedAgents.length > 1 ? "s" : ""}
                </p>
                {selectedSupervisorRows.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedSupervisorRows.slice(0, 3).map((agent) => (
                      <Badge key={agent.value} variant="outline" className="text-[10px]">{agent.label}</Badge>
                    ))}
                    {selectedSupervisorRows.length > 3 && (
                      <Badge variant="outline" className="text-[10px]">+{selectedSupervisorRows.length - 3}</Badge>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Year: {year} · Region: {region || "All"} · Distribution: {strategy}</p>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Annual Targets</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-sky-500" /> Employers</div>
                    <span className="font-semibold tabular-nums">{employerTarget.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-emerald-500" /> Employees</div>
                    <span className="font-semibold tabular-nums">{employeeTarget.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-amber-500" /> Revenue</div>
                    <span className="font-semibold tabular-nums">{currency} {financeTarget.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quarterly breakdown */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Quarterly Breakdown</p>
              <QuarterlyBreakdownGrid quarters={quarterlyBreakdown} currency={currency} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="rounded-xl gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Edit
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 px-6"
            >
              {creating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
              ) : (
                <><Check className="h-4 w-4" /> Create Target Profile</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
