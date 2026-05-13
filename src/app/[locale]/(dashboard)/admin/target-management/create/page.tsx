"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  TargetTypeIcon, QuarterlyBreakdownGrid,
} from "@/components/features/targets/TargetComponents";
import {
  ArrowLeft, ArrowRight, Check, Building2, Users, DollarSign,
  CalendarDays, MapPin, Sparkles, SplitSquareVertical,
  FileText, Eye, Target, Loader2,
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
  const [bulkMode, setBulkMode] = useState(false);

  // Step 1
  const [superAgents, setSuperAgents] = useState<{ value: string; label: string }[]>([]);
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

  // Fetch super agents
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/super-agents?limit=100");
        if (res.ok) {
          const data = await res.json();
          setSuperAgents(
            (data.superAgents ?? data.items ?? []).map(
              (sa: { userId?: string; _id?: string; name?: string; user?: { name?: string; _id?: string } }) => ({
                value: sa.userId ?? sa.user?._id ?? sa._id ?? "",
                label: sa.name ?? sa.user?.name ?? "Unknown",
              })
            )
          );
        }
      } catch { /* ignore */ }
    })();
  }, []);

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

      if (res.ok) {
        toast.success(`Target profile${isBulk ? "s" : ""} created successfully`);
        router.push(`/${locale}/admin/target-management`);
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to create");
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
    <div className="page-container max-w-4xl mx-auto space-y-6">
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

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Supervisor(s) *
              </Label>
              <p className="text-xs text-muted-foreground mb-1">
                Select one or more supervisors to assign targets to
              </p>
              {bulkMode ? (
                <div className="space-y-2">
                  {superAgents.map((sa) => {
                    const isSelected = selectedAgents.includes(sa.value);
                    return (
                      <label key={sa.value} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${isSelected ? "border-sky-500 bg-sky-500/5" : "border-border hover:border-border/80"}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedAgents((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== sa.value)
                                : [...prev, sa.value]
                            );
                          }}
                          className="rounded"
                        />
                        <span className="text-sm font-medium">{sa.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <SearchableSelect
                  options={superAgents}
                  value={selectedAgents[0] ?? ""}
                  onValueChange={(v) => setSelectedAgents([v])}
                  placeholder={t("selectSuperAgent")}
                  className="h-11 rounded-xl border-border bg-card"
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-fit text-xs"
                onClick={() => { setBulkMode(!bulkMode); setSelectedAgents([]); }}
              >
                {bulkMode ? "Switch to single select" : "Switch to bulk select"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year *</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value) || currentYear)}
                    className="h-11 rounded-xl border-border bg-card pl-9"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Region</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="e.g. Dubai, Abu Dhabi"
                    className="h-11 rounded-xl border-border bg-card pl-9"
                  />
                </div>
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
