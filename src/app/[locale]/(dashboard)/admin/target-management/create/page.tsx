"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  TargetTypeIcon, QuarterlyBreakdownGrid,
} from "@/components/features/targets/TargetComponents";
import {
  ArrowLeft, ArrowRight, Check, Building2, Users, DollarSign,
  CalendarDays, MapPin, Sparkles, SplitSquareVertical,
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
/*  Wizard Step Components                                             */
/* ------------------------------------------------------------------ */

function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ["Select", "Set Targets", "Distribution", "Quarterly", "Review"];
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const s = i + 1;
        const isActive = s === step;
        const isComplete = s < step;
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
              isComplete ? "bg-emerald-500 text-white" :
              isActive ? "bg-sky-600 text-white ring-4 ring-sky-500/20" :
              "bg-muted text-muted-foreground"
            }`}>
              {isComplete ? <Check className="h-4 w-4" /> : s}
            </div>
            <span className={`hidden sm:inline text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
              {labels[i]}
            </span>
            {s < total && <div className={`h-px w-6 sm:w-12 ${s < step ? "bg-emerald-500" : "bg-border"}`} />}
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

  // Step 1
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

  // Step 2
  const [employerTarget, setEmployerTarget] = useState(0);
  const [employeeTarget, setEmployeeTarget] = useState(0);
  const [financeTarget, setFinanceTarget] = useState(0);
  const [currency, setCurrency] = useState("AED");

  // Step 3
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

  // Generate monthly distribution when strategy changes
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
      // Fix rounding
      const empSum = months.reduce((s, m) => s + m.employerTarget, 0);
      const emplSum = months.reduce((s, m) => s + m.employeeTarget, 0);
      const finSum = months.reduce((s, m) => s + m.financeTarget, 0);
      months[11].employerTarget += employerTarget - empSum;
      months[11].employeeTarget += employeeTarget - emplSum;
      months[11].financeTarget += financeTarget - finSum;
      return months;
    }
    // Custom — start with equal then user edits
    return Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      employerTarget: Math.floor(employerTarget / 12) + (i < (employerTarget % 12) ? 1 : 0),
      employeeTarget: Math.floor(employeeTarget / 12) + (i < (employeeTarget % 12) ? 1 : 0),
      financeTarget: Math.floor(financeTarget / 12) + (i < (financeTarget % 12) ? 1 : 0),
    }));
  }, [strategy, employerTarget, employeeTarget, financeTarget]);

  useEffect(() => {
    if (step === 3) {
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

  // Sums
  const monthlySum = useMemo(() => ({
    employer: monthlyTargets.reduce((s, m) => s + m.employerTarget, 0),
    employee: monthlyTargets.reduce((s, m) => s + m.employeeTarget, 0),
    finance: monthlyTargets.reduce((s, m) => s + m.financeTarget, 0),
  }), [monthlyTargets]);

  const sumValid =
    monthlySum.employer === employerTarget &&
    monthlySum.employee === employeeTarget &&
    monthlySum.finance === financeTarget;

  // Navigation
  const canNext = () => {
    if (step === 1) return selectedAgents.length > 0 && year > 0;
    if (step === 2) return employerTarget > 0 || employeeTarget > 0 || financeTarget > 0;
    if (step === 3) return sumValid;
    if (step === 4) return true;
    return true;
  };

  const handleCreate = async () => {
    if (selectedAgents.length === 0) {
      toast.error("Select at least one supervisor before creating a target profile");
      setStep(1);
      return;
    }

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
            monthlyTargets,
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
            monthlyTargets,
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
    <div className="page-container max-w-6xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push(`/${locale}/admin/target-management`)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Target Management
      </button>

      {/* Header */}
      <div className="workspace-glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="workspace-tone-sky rounded-2xl p-3">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Create Target Profile</h1>
            <p className="text-sm text-muted-foreground">
              Set unified annual targets with employer, employee, and finance metrics
            </p>
          </div>
        </div>
        <StepIndicator step={step} total={5} />
      </div>

      {/* ============= STEP 1: Select ============= */}
      {step === 1 && (
        <div className="workspace-glass-panel rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-xl bg-sky-500/10 p-2 text-sky-600"><Users className="h-4 w-4" /></div>
            <h2 className="text-lg font-semibold">Step 1: Select Supervisor</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Planning Year *</Label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value) || currentYear)}
                  className="h-11 rounded-xl border-border bg-card pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">Target status, performance, and risk badges update for the selected year.</p>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Target Region</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. Dubai, Abu Dhabi"
                  className="h-11 rounded-xl border-border bg-card pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">This region is saved on the new target profile. It is separate from directory filtering.</p>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border/60 bg-card/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" /> Enterprise Selection Mode
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">Supervisor Directory</p>
                <p className="text-sm text-muted-foreground">Search, filter, compare team coverage, and select supervisors without relying on a long dropdown.</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  { key: "single", label: "Individual", hint: "One supervisor" },
                  { key: "bulk", label: "Bulk", hint: "Multi-select" },
                  { key: "region", label: "Region", hint: "Bulk by filter" },
                ] as const).map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setSelectionMode(mode.key)}
                    className={`rounded-xl border px-4 py-3 text-left transition-all ${selectionMode === mode.key ? "border-sky-500 bg-sky-500/5 ring-2 ring-sky-500/15" : "border-border bg-background hover:border-border/80"}`}
                  >
                    <p className="text-sm font-semibold text-foreground">{mode.label}</p>
                    <p className="text-[11px] text-muted-foreground">{mode.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.8fr))]">
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={directorySearch}
                    onChange={(e) => setDirectorySearch(e.target.value)}
                    placeholder="Search supervisor, email, or territory"
                    className="h-11 rounded-xl border-border bg-background pl-9"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Availability</Label>
                <SearchableSelect
                  options={[
                    { value: "all", label: "All supervisors" },
                    { value: "available", label: "Available" },
                    { value: "has_active_target", label: "Already targeted" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                  value={availabilityFilter}
                  onValueChange={(value) => setAvailabilityFilter(value as "all" | DirectoryAvailability)}
                  className="h-11 rounded-xl border-border bg-background"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk</Label>
                <SearchableSelect
                  options={[
                    { value: "all", label: "All risk levels" },
                    { value: "high", label: "High risk" },
                    { value: "medium", label: "Medium risk" },
                    { value: "low", label: "Low risk" },
                  ]}
                  value={riskFilter}
                  onValueChange={(value) => setRiskFilter(value as "all" | DirectoryRisk)}
                  className="h-11 rounded-xl border-border bg-background"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Territory</Label>
                <SearchableSelect
                  options={[
                    { value: "all", label: "All territories" },
                    ...territoryOptions.map((territory) => ({ value: territory, label: territory })),
                  ]}
                  value={territoryFilter}
                  onValueChange={setTerritoryFilter}
                  className="h-11 rounded-xl border-border bg-background"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sort</Label>
                <SearchableSelect
                  options={[
                    { value: "recommended", label: "Recommended" },
                    { value: "performance", label: "Performance" },
                    { value: "team", label: "Team size" },
                    { value: "name", label: "Name" },
                  ]}
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as DirectorySort)}
                  className="h-11 rounded-xl border-border bg-background"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SupervisorSummaryCard
                label="Matching Supervisors"
                value={directoryTotals.matchingSupervisors.toLocaleString()}
                hint="Visible after search and filter rules"
              />
              <SupervisorSummaryCard
                label="Team Coverage"
                value={directoryTotals.totalTeamSize.toLocaleString()}
                hint="Direct agents across visible supervisors"
              />
              <SupervisorSummaryCard
                label="Existing Profiles"
                value={directoryTotals.withActiveTarget.toLocaleString()}
                hint={`Supervisors already holding a ${year} target`}
              />
              <SupervisorSummaryCard
                label="At Risk"
                value={directoryTotals.highRiskProfiles.toLocaleString()}
                hint="High-risk active target profiles"
              />
            </div>

            {directoryTotalCount > superAgents.length && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
                Showing {superAgents.length} of {directoryTotalCount} matching supervisors. Refine search or filters further to bring more supervisors into the current directory slice.
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border/70 bg-background/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{selectedAgents.length} supervisor{selectedAgents.length === 1 ? "" : "s"} selected</p>
                <p className="text-xs text-muted-foreground">
                  {selectionMode === "single"
                    ? "Choose one supervisor for an individual allocation."
                    : selectionMode === "bulk"
                      ? "Pick multiple supervisors for a bulk target rollout."
                      : territoryFilter === "all"
                        ? "Choose a territory filter, then select visible supervisors by region."
                        : `Use ${territoryFilter} to bulk assign by territory.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectionMode !== "single" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={selectVisibleSupervisors}
                    disabled={visibleSelectableIds.length === 0 || (selectionMode === "region" && territoryFilter === "all")}
                  >
                    {selectionMode === "region" ? "Select Visible Region" : "Select Visible"}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => {
                    setSelectedAgents([]);
                    setSelectedSupervisorDetails({});
                  }}
                  disabled={selectedAgents.length === 0}
                >
                  Clear Selection
                </Button>
              </div>
            </div>

            {selectedSupervisorRows.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedSupervisorRows.slice(0, 6).map((agent) => (
                  <Badge key={agent.value} variant="info" className="px-3 py-1.5 text-[11px]">
                    {agent.label}
                    {agent.regionNames[0] ? ` · ${agent.regionNames[0]}` : ""}
                  </Badge>
                ))}
                {selectedSupervisorRows.length > 6 && (
                  <Badge variant="outline" className="px-3 py-1.5 text-[11px]">+{selectedSupervisorRows.length - 6} more</Badge>
                )}
              </div>
            )}

            <div className="hidden lg:block overflow-hidden rounded-2xl border border-border/70 bg-background">
              <table className="w-full text-sm">
                <thead className="bg-muted/35">
                  <tr>
                    <th className="w-16 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Select</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supervisor</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Territory</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Performance</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {directoryLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index} className="border-t border-border/60">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="h-12 animate-pulse rounded-xl bg-muted/50" />
                        </td>
                      </tr>
                    ))
                  ) : filteredSuperAgents.length === 0 ? (
                    <tr className="border-t border-border/60">
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No supervisors match the current filters.</td>
                    </tr>
                  ) : (
                    filteredSuperAgents.map((agent) => {
                      const selected = selectedAgents.includes(agent.value);
                      const selectable = canSelectSupervisor(agent);

                      return (
                        <tr
                          key={agent.value}
                          onClick={() => selectable && toggleSupervisorSelection(agent.value)}
                          className={`border-t border-border/60 transition-colors ${selectable ? "cursor-pointer hover:bg-sky-500/[0.03]" : "cursor-not-allowed bg-muted/20"} ${selected ? "bg-sky-500/[0.06]" : ""}`}
                        >
                          <td className="px-4 py-4">
                            {selectionMode === "single" ? (
                              <Badge variant={selected ? "info" : "outline"}>{selected ? "Selected" : "Choose"}</Badge>
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
                          <td className="px-4 py-4 align-top">
                            <p className="font-medium text-foreground">{agent.label}</p>
                            <p className="text-xs text-muted-foreground">{agent.email || "No email"}</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap gap-1.5">
                              {agent.regionNames.length > 0 ? agent.regionNames.slice(0, 3).map((territory) => (
                                <Badge key={territory} variant="outline">{territory}</Badge>
                              )) : (
                                <Badge variant="outline">Unassigned</Badge>
                              )}
                              {agent.regionNames.length > 3 && (
                                <Badge variant="outline">+{agent.regionNames.length - 3}</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <p className="font-semibold tabular-nums text-foreground">{agent.teamSize}</p>
                            <p className="text-xs text-muted-foreground">direct agents</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <AvailabilityBadge availability={agent.availability} />
                            {agent.availabilityReason && (
                              <p className="mt-2 max-w-[180px] text-xs text-muted-foreground">{agent.availabilityReason}</p>
                            )}
                          </td>
                          <td className="px-4 py-4 align-top">
                            {agent.targetProfile ? (
                              <div className="min-w-[180px] space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{agent.targetProfile.year} progress</span>
                                  <span className="font-semibold tabular-nums text-foreground">{agent.targetProfile.overallProgress}%</span>
                                </div>
                                <Progress value={Math.min(agent.targetProfile.overallProgress, 100)} className="h-2" />
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No active target profile</p>
                            )}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <RiskBadge risk={agent.targetProfile?.riskScore} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {directoryLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted/50" />
                ))
              ) : filteredSuperAgents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No supervisors match the current filters.</div>
              ) : (
                filteredSuperAgents.map((agent) => {
                  const selected = selectedAgents.includes(agent.value);
                  const selectable = canSelectSupervisor(agent);

                  return (
                    <button
                      key={agent.value}
                      type="button"
                      onClick={() => selectable && toggleSupervisorSelection(agent.value)}
                      className={`rounded-2xl border p-4 text-left transition-all ${selected ? "border-sky-500 bg-sky-500/[0.05] ring-2 ring-sky-500/15" : "border-border bg-background"} ${selectable ? "hover:border-border/80" : "opacity-75"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{agent.label}</p>
                          <p className="text-xs text-muted-foreground">{agent.email || "No email"}</p>
                        </div>
                        {selectionMode === "single" ? (
                          <Badge variant={selected ? "info" : "outline"}>{selected ? "Selected" : "Choose"}</Badge>
                        ) : (
                          <div onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={selected}
                              disabled={!selectable}
                              onCheckedChange={(checked) => toggleSupervisorSelection(agent.value, checked === true)}
                            />
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {agent.regionNames.length > 0 ? agent.regionNames.map((territory) => (
                          <Badge key={territory} variant="outline">{territory}</Badge>
                        )) : <Badge variant="outline">Unassigned</Badge>}
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team Size</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{agent.teamSize}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                          <div className="mt-1"><AvailabilityBadge availability={agent.availability} /></div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk</p>
                          <div className="mt-1"><RiskBadge risk={agent.targetProfile?.riskScore} /></div>
                        </div>
                      </div>

                      {agent.targetProfile ? (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{agent.targetProfile.year} progress</span>
                            <span className="font-semibold tabular-nums text-foreground">{agent.targetProfile.overallProgress}%</span>
                          </div>
                          <Progress value={Math.min(agent.targetProfile.overallProgress, 100)} className="h-2" />
                        </div>
                      ) : (
                        <p className="mt-4 text-xs text-muted-foreground">No active target profile for {year}.</p>
                      )}

                      {agent.availabilityReason && (
                        <p className="mt-3 text-xs text-muted-foreground">{agent.availabilityReason}</p>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supervisor(s) *</Label>
                <p className="rounded-xl border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
                  {selectedSupervisorRows.length > 0
                    ? selectedSupervisorRows.map((agent) => agent.label).join(", ")
                    : "No supervisor selected yet"}
                </p>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selection Guardrails</Label>
                <p className="rounded-xl border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
                  Active targets and inactive supervisors remain visible for planning, but they cannot be selected.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============= STEP 2: Set Annual Targets ============= */}
      {step === 2 && (
        <div className="workspace-glass-panel rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600"><Target className="h-4 w-4" /></div>
            <h2 className="text-lg font-semibold">Step 2: Set Annual Targets</h2>
          </div>

          <div className="grid gap-6">
            {/* Employer */}
            <div className="workspace-glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TargetTypeIcon type="employer" size="sm" />
                <span className="text-sm font-semibold">{t("employerTarget")}</span>
              </div>
              <Input
                type="number"
                value={employerTarget || ""}
                onChange={(e) => setEmployerTarget(parseInt(e.target.value) || 0)}
                placeholder="e.g. 1200"
                className="h-11 rounded-xl border-border bg-card text-lg font-semibold"
              />
              <p className="mt-1 text-xs text-muted-foreground">Number of employers to acquire this year</p>
            </div>

            {/* Employee */}
            <div className="workspace-glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TargetTypeIcon type="employee" size="sm" />
                <span className="text-sm font-semibold">{t("employeeTarget")}</span>
              </div>
              <Input
                type="number"
                value={employeeTarget || ""}
                onChange={(e) => setEmployeeTarget(parseInt(e.target.value) || 0)}
                placeholder="e.g. 5000"
                className="h-11 rounded-xl border-border bg-card text-lg font-semibold"
              />
              <p className="mt-1 text-xs text-muted-foreground">Number of employee placements this year</p>
            </div>

            {/* Finance */}
            <div className="workspace-glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TargetTypeIcon type="finance" size="sm" />
                <span className="text-sm font-semibold">{t("financeTarget")}</span>
              </div>
              <div className="flex gap-3">
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                  maxLength={3}
                  className="h-11 w-20 rounded-xl border-border bg-card text-center font-semibold"
                />
                <Input
                  type="number"
                  value={financeTarget || ""}
                  onChange={(e) => setFinanceTarget(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 5000000"
                  className="h-11 flex-1 rounded-xl border-border bg-card text-lg font-semibold"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Revenue target for the year</p>
            </div>
          </div>
        </div>
      )}

      {/* ============= STEP 3: Monthly Distribution ============= */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="workspace-glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600"><SplitSquareVertical className="h-4 w-4" /></div>
              <h2 className="text-lg font-semibold">Step 3: Monthly Distribution</h2>
            </div>

            {/* Strategy selector */}
            <div className="grid grid-cols-3 gap-3">
              {(["equal", "seasonal", "custom"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    strategy === s
                      ? "border-sky-500 bg-sky-500/5 ring-2 ring-sky-500/20"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <p className="text-sm font-semibold capitalize">{s}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {s === "equal" ? "Divide evenly across 12 months" :
                     s === "seasonal" ? "Q1 & Q3 weighted higher (30/20/30/20)" :
                     "Custom month-by-month editing"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Monthly grid */}
          <div className="workspace-glass-panel rounded-2xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Month</th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <div className="flex items-center justify-end gap-1"><Building2 className="h-3 w-3" /> Employer</div>
                    </th>
                    <th className="py-2 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <div className="flex items-center justify-end gap-1"><Users className="h-3 w-3" /> Employee</div>
                    </th>
                    <th className="py-2 pl-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <div className="flex items-center justify-end gap-1"><DollarSign className="h-3 w-3" /> Finance</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyTargets.map((m) => (
                    <tr key={m.month} className="border-b border-border/30">
                      <td className="py-2 pr-3 text-xs font-medium">{MONTHS[m.month - 1]}</td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={m.employerTarget || ""}
                          onChange={(e) => updateMonthly(m.month, "employerTarget", parseInt(e.target.value) || 0)}
                          disabled={strategy !== "custom"}
                          className="h-8 w-24 ml-auto rounded-lg text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={m.employeeTarget || ""}
                          onChange={(e) => updateMonthly(m.month, "employeeTarget", parseInt(e.target.value) || 0)}
                          disabled={strategy !== "custom"}
                          className="h-8 w-24 ml-auto rounded-lg text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="py-2 pl-3">
                        <Input
                          type="number"
                          value={m.financeTarget || ""}
                          onChange={(e) => updateMonthly(m.month, "financeTarget", parseInt(e.target.value) || 0)}
                          disabled={strategy !== "custom"}
                          className="h-8 w-28 ml-auto rounded-lg text-right text-sm tabular-nums"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2 pr-3 text-xs">Total</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${monthlySum.employer !== employerTarget ? "text-red-500" : "text-emerald-600"}`}>
                      {monthlySum.employer.toLocaleString()} / {employerTarget.toLocaleString()}
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums ${monthlySum.employee !== employeeTarget ? "text-red-500" : "text-emerald-600"}`}>
                      {monthlySum.employee.toLocaleString()} / {employeeTarget.toLocaleString()}
                    </td>
                    <td className={`py-2 pl-3 text-right tabular-nums ${monthlySum.finance !== financeTarget ? "text-red-500" : "text-emerald-600"}`}>
                      {currency} {monthlySum.finance.toLocaleString()} / {currency} {financeTarget.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============= STEP 4: Quarterly Planning ============= */}
      {step === 4 && (
        <div className="workspace-glass-panel rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-xl bg-violet-500/10 p-2 text-violet-600"><CalendarDays className="h-4 w-4" /></div>
            <h2 className="text-lg font-semibold">Step 4: Quarterly Planning</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Review the quarterly breakdown generated from your monthly distribution.
          </p>
          <QuarterlyBreakdownGrid quarters={quarterlyBreakdown} currency={currency} />
        </div>
      )}

      {/* ============= STEP 5: Review + Confirm ============= */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="workspace-glass-panel rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600"><Eye className="h-4 w-4" /></div>
              <h2 className="text-lg font-semibold">Step 5: Review & Confirm</h2>
            </div>

            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="workspace-glass-panel rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Assignment</p>
                <p className="text-sm font-medium">
                  {selectedAgents.length} supervisor{selectedAgents.length > 1 ? "s" : ""} selected
                </p>
                <p className="text-xs text-muted-foreground">Year: {year} · Region: {region || "All"}</p>
                <p className="text-xs text-muted-foreground">Strategy: {strategy}</p>
              </div>
              <div className="workspace-glass-panel rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Annual Targets</p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Employer</div>
                    <span className="font-semibold tabular-nums">{employerTarget.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" /> Employee</div>
                    <span className="font-semibold tabular-nums">{employeeTarget.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" /> Finance</div>
                    <span className="font-semibold tabular-nums">{currency} {financeTarget.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quarterly preview */}
            <QuarterlyBreakdownGrid quarters={quarterlyBreakdown} currency={currency} />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="rounded-xl gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {step < 5 ? (
            <Button
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              disabled={!canNext()}
              className="rounded-xl gap-2 bg-sky-600 hover:bg-sky-700"
            >
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
