"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import {
  Building2, Users,
  CalendarDays, RotateCcw, FileText, X, Target,
  CircleDollarSign, Activity, Sparkles,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  ProgressRing, TargetSummaryCard,
} from "@/components/features/targets/TargetComponents";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyTrendItem {
  month: number;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  overallProgress: number;
}

interface YearOverYear {
  currentYear: { year: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; overallProgress: number };
  previousYear: { year: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; overallProgress: number };
  growth: { employerAchieved: number; employeeAchieved: number; financeAchieved: number; overallProgress: number };
}

interface BusinessVolumeItem {
  month: number;
  approved: number;
  total: number;
  count: number;
}

interface OwnProfile {
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  employerProgress: number;
  employeeProgress: number;
  financeProgress: number;
  overallProgress: number;
  currency: string;
  riskScore: string;
  incentiveTier: string;
}

interface ReportData {
  year: number;
  ownProfile: OwnProfile | null;
  monthlyTrend: MonthlyTrendItem[];
  yearOverYear: YearOverYear | null;
  businessVolume: BusinessVolumeItem[];
  totalBusinessVolume: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCurrency(value: number, currency = "AED"): string {
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${value.toLocaleString()}`;
}

function GrowthIndicator({ value }: { value: number }) {
  if (value > 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600"><ArrowUpRight className="h-3 w-3" />+{value}%</span>;
  if (value < 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500"><ArrowDownRight className="h-3 w-3" />{value}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentTargetReportPage() {
  const t = useTranslations("targets");
  const currentYear = new Date().getFullYear();

  // Filters
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    fetch("/api/agent/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.profile?.currencyCode) {
          setCurrencyCode(payload.profile.currencyCode);
        }
      })
      .catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/target-report?year=${yearFilter}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        toast.error("Failed to load report");
      }
    } catch {
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const hasActiveFilters = quarterFilter !== "all" || categoryFilter !== "all";

  function clearFilters() {
    setQuarterFilter("all");
    setCategoryFilter("all");
  }

  // Filter by quarter
  const filteredTrend = useMemo(() => {
    if (!data) return [];
    let months = data.monthlyTrend;
    if (quarterFilter !== "all") {
      const q = parseInt(quarterFilter);
      const start = (q - 1) * 3;
      months = months.filter((m) => m.month > start && m.month <= start + 3);
    }
    return months;
  }, [data, quarterFilter]);

  const filteredBusinessVolume = useMemo(() => {
    if (!data) return [];
    let months = data.businessVolume;
    if (quarterFilter !== "all") {
      const q = parseInt(quarterFilter);
      const start = (q - 1) * 3;
      months = months.filter((m) => m.month > start && m.month <= start + 3);
    }
    return months;
  }, [data, quarterFilter]);

  // Chart data — 3 separate series (never mixed on same axis)
  const employerChartData = useMemo(() => filteredTrend.map((m) => ({
    name: MONTHS_SHORT[m.month - 1],
    "Target": m.employerTarget,
    "Achieved": m.employerAchieved,
  })), [filteredTrend]);

  const employeeChartData = useMemo(() => filteredTrend.map((m) => ({
    name: MONTHS_SHORT[m.month - 1],
    "Target": m.employeeTarget,
    "Achieved": m.employeeAchieved,
  })), [filteredTrend]);

  const financeChartData = useMemo(() => filteredTrend.map((m) => ({
    name: MONTHS_SHORT[m.month - 1],
    "Target (K)": Math.round(m.financeTarget / 1000),
    "Achieved (K)": Math.round(m.financeAchieved / 1000),
  })), [filteredTrend]);

  const businessVolumeChartData = useMemo(() => {
    return filteredBusinessVolume.map((bv) => ({
      name: MONTHS_SHORT[bv.month - 1],
      "Collected (K)": Math.round(bv.approved / 1000),
      "Total (K)": Math.round(bv.total / 1000),
    }));
  }, [filteredBusinessVolume]);

  // Export via useTableExport
  const exportData = useMemo(() => {
    if (!data || !data.ownProfile) return [];
    const p = data.ownProfile;
    return data.monthlyTrend.map((m, i) => ({
      month: MONTHS_SHORT[i],
      employerTarget: m.employerTarget,
      employerAchieved: m.employerAchieved,
      employeeTarget: m.employeeTarget,
      employeeAchieved: m.employeeAchieved,
      financeTarget: m.financeTarget,
      financeAchieved: m.financeAchieved,
      businessVolume: data.businessVolume[i]?.total ?? 0,
      overallProgress: m.overallProgress,
      currency: p.currency,
    }));
  }, [data]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Month", key: "month" },
    { header: "Employer Target", key: "employerTarget", formatter: (v) => String(v ?? 0) },
    { header: "Employer Achieved", key: "employerAchieved", formatter: (v) => String(v ?? 0) },
    { header: "Employee Target", key: "employeeTarget", formatter: (v) => String(v ?? 0) },
    { header: "Employee Achieved", key: "employeeAchieved", formatter: (v) => String(v ?? 0) },
    { header: "Finance Target", key: "financeTarget", formatter: (v) => String(v ?? 0) },
    { header: "Finance Achieved", key: "financeAchieved", formatter: (v) => String(v ?? 0) },
    { header: "Business Volume", key: "businessVolume", formatter: (v) => String(v ?? 0) },
    { header: "Overall %", key: "overallProgress", formatter: (v) => `${v ?? 0}%` },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: exportData as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: `my-target-report-${yearFilter}`,
    title: `My Target Report ${yearFilter}`,
  });

  if (loading) {
    return (
      <div className="page-container space-y-6">
        <div className="h-20 w-full animate-pulse rounded-[20px] bg-muted/40" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (!data || !data.ownProfile) {
    return (
      <div className="page-container">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Target className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold">{t("noTargetsAssigned")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("contactSupervisor")}</p>
        </div>
      </div>
    );
  }

  const profile = data.ownProfile;
  const currency = currencyCode;

  return (
    <div className="page-container agent-legacy-surface space-y-6 print:space-y-4">
      {/* ═══════ HERO ═══════ */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">My Target Report</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Personal performance report — {yearFilter}. Track your employer, employee, and finance targets.
            </p>
          </div>
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[220px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Performance</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{profile.overallProgress}% overall</p>
            <p className="text-xs text-muted-foreground">Risk: {profile.riskScore} · Tier: {profile.incentiveTier}</p>
          </div>
        </div>
      </section>

      {/* ═══════ KPI Cards ═══════ */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30"><Building2 className="h-4 w-4" /></div>
            {data.yearOverYear && <GrowthIndicator value={data.yearOverYear.growth.employerAchieved} />}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employer</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-600">{profile.employerAchieved} <span className="text-base font-normal text-muted-foreground">/ {profile.employerTarget}</span></p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{profile.employerTarget > 0 ? Math.round((profile.employerAchieved / profile.employerTarget) * 100) : 0}% complete</span>
            <span>{Math.max(0, profile.employerTarget - profile.employerAchieved)} pending</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/20">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${profile.employerTarget > 0 ? Math.min(100, Math.round((profile.employerAchieved / profile.employerTarget) * 100)) : 0}%` }} />
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30"><Users className="h-4 w-4" /></div>
            {data.yearOverYear && <GrowthIndicator value={data.yearOverYear.growth.employeeAchieved} />}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employee</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-purple-600">{profile.employeeAchieved} <span className="text-base font-normal text-muted-foreground">/ {profile.employeeTarget}</span></p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{profile.employeeTarget > 0 ? Math.round((profile.employeeAchieved / profile.employeeTarget) * 100) : 0}% complete</span>
            <span>{Math.max(0, profile.employeeTarget - profile.employeeAchieved)} pending</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-purple-100 dark:bg-purple-900/20">
            <div className="h-full rounded-full bg-purple-500" style={{ width: `${profile.employeeTarget > 0 ? Math.min(100, Math.round((profile.employeeAchieved / profile.employeeTarget) * 100)) : 0}%` }} />
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"><CircleDollarSign className="h-4 w-4" /></div>
            {data.yearOverYear && <GrowthIndicator value={data.yearOverYear.growth.financeAchieved} />}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Business Volume</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{formatCurrency(data.totalBusinessVolume, currency)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Total collected revenue</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/20">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${profile.financeTarget > 0 ? Math.min(100, Math.round((profile.financeAchieved / profile.financeTarget) * 100)) : 0}%` }} />
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30"><Activity className="h-4 w-4" /></div>
            {data.yearOverYear && <GrowthIndicator value={data.yearOverYear.growth.overallProgress} />}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Overall</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-violet-600">{profile.overallProgress}%</p>
          <p className="mt-2 text-xs text-muted-foreground">Tier: {profile.incentiveTier} · Risk: {profile.riskScore}</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-violet-900/20">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, profile.overallProgress)}%` }} />
          </div>
        </div>
      </section>

      {/* ═══════ TOOLBAR ═══════ */}
      <TableToolbar
        title="Monthly breakdown"
        description="Filter by quarter or category to drill down."
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        hasActiveFilters={hasActiveFilters}
        right={
          <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 gap-1.5 rounded-lg print:hidden">
            <FileText className="h-3.5 w-3.5" /> Print
          </Button>
        }
        actions={hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-muted-foreground">
            <X className="h-3.5 w-3.5 mr-1" /> Clear filters
          </Button>
        ) : undefined}
        filterContent={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)} className="h-9 w-24 rounded-lg text-sm" />
            </div>
            <Select value={quarterFilter} onValueChange={setQuarterFilter}>
              <SelectTrigger className="h-9 w-[130px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder="Quarter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quarters</SelectItem>
                <SelectItem value="1">Q1 (Jan–Mar)</SelectItem>
                <SelectItem value="2">Q2 (Apr–Jun)</SelectItem>
                <SelectItem value="3">Q3 (Jul–Sep)</SelectItem>
                <SelectItem value="4">Q4 (Oct–Dec)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[140px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="employer">Employer</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setYearFilter(currentYear)} disabled={yearFilter === currentYear} className="h-9 gap-1.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Reset Year
            </Button>
          </div>
        }
      />

      {/* ═══════ Progress Rings ═══════ */}
      <section className="workspace-glass-panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-center gap-8">
          <ProgressRing value={profile.employerProgress} label="Employer" sublabel={`${profile.employerAchieved}/${profile.employerTarget}`} />
          <ProgressRing value={profile.employeeProgress} label="Employee" sublabel={`${profile.employeeAchieved}/${profile.employeeTarget}`} />
          <ProgressRing value={profile.financeProgress} label="Finance" sublabel={`${currency} ${profile.financeAchieved.toLocaleString()}`} />
          <ProgressRing value={profile.overallProgress} label="Overall" sublabel="Annual" color="#3b82f6" />
        </div>
      </section>

      {/* ═══════ Target Summary Card ═══════ */}
      <TargetSummaryCard
        employerTarget={profile.employerTarget}
        employeeTarget={profile.employeeTarget}
        financeTarget={profile.financeTarget}
        employerAchieved={profile.employerAchieved}
        employeeAchieved={profile.employeeAchieved}
        financeAchieved={profile.financeAchieved}
        currency={currency}
      />

      {/* ═══════ KPI with YoY ═══════ */}
      {data.yearOverYear && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employers</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{profile.employerAchieved}</p>
                <GrowthIndicator value={data.yearOverYear.growth.employerAchieved} />
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5"><Building2 className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employees</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{profile.employeeAchieved}</p>
                <GrowthIndicator value={data.yearOverYear.growth.employeeAchieved} />
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Business Volume</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(data.totalBusinessVolume, currency)}</p>
                <GrowthIndicator value={data.yearOverYear.growth.financeAchieved} />
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5"><CircleDollarSign className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Overall Progress</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{profile.overallProgress}%</p>
                <GrowthIndicator value={data.yearOverYear.growth.overallProgress} />
              </div>
              <div className="workspace-tone-violet rounded-2xl p-2.5"><Activity className="h-5 w-5" /></div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════ Section header ═══════ */}
      {data.monthlyTrend.length > 0 && (
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight">Performance Analytics</h2>
          <Badge variant="outline" className="text-xs">{quarterFilter !== "all" ? `Q${quarterFilter}` : `${yearFilter} — 12 months`}</Badge>
        </div>
      )}

      {/* ═══════ Chart A + B (2-up) ═══════ */}
      {data.monthlyTrend.length > 0 && (categoryFilter === "all" || categoryFilter === "employer" || categoryFilter === "employee") && (
        <div className="grid gap-5 lg:grid-cols-2">
          {(categoryFilter === "all" || categoryFilter === "employer") && (
            <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30"><Building2 className="h-4 w-4" /></div>
                <div>
                  <h3 className="text-sm font-semibold">Employer Target vs Achieved</h3>
                  <p className="text-xs text-muted-foreground">Count — employer accounts</p>
                </div>
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={employerChartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <ReTooltip contentStyle={{ borderRadius: "12px", borderColor: "rgba(148,163,184,0.18)", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="Target" stroke="#93c5fd" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Achieved" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
          {(categoryFilter === "all" || categoryFilter === "employee") && (
            <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30"><Users className="h-4 w-4" /></div>
                <div>
                  <h3 className="text-sm font-semibold">Employee Target vs Achieved</h3>
                  <p className="text-xs text-muted-foreground">Count — placements / employees</p>
                </div>
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={employeeChartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <ReTooltip contentStyle={{ borderRadius: "12px", borderColor: "rgba(148,163,184,0.18)", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="Target" stroke="#c4b5fd" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Achieved" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: "#8b5cf6" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══════ Chart C — Finance (full-width, AED only) ═══════ */}
      {data.monthlyTrend.length > 0 && (categoryFilter === "all" || categoryFilter === "finance") && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"><CircleDollarSign className="h-4 w-4" /></div>
              <div>
                <h3 className="text-sm font-semibold">Finance Revenue — {yearFilter}</h3>
                <p className="text-xs text-muted-foreground">AED values (thousands) — isolated from count metrics</p>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20">AED only</Badge>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financeChartData} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="agentGradFinTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="agentGradFinAchieved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} unit="K" />
                <ReTooltip contentStyle={{ borderRadius: "12px", borderColor: "rgba(148,163,184,0.18)", fontSize: 12 }} formatter={(value: unknown) => [`${value ?? 0}K`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="Target (K)" stroke="#6ee7b7" strokeDasharray="5 5" strokeWidth={2} fill="url(#agentGradFinTarget)" />
                <Area type="monotone" dataKey="Achieved (K)" stroke="#10b981" strokeWidth={2.5} fill="url(#agentGradFinAchieved)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ═══════ Revenue Intelligence ═══════ */}
      {data.businessVolume.length > 0 && data.totalBusinessVolume > 0 && (categoryFilter === "all" || categoryFilter === "finance") && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Revenue Intelligence — {yearFilter}</h3>
              <p className="text-xs text-muted-foreground">Monthly collected vs total breakdown (AED thousands)</p>
            </div>
            <CircleDollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={businessVolumeChartData} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="agentGradCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="agentGradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} unit="K" />
                <ReTooltip contentStyle={{ borderRadius: "12px", borderColor: "rgba(148,163,184,0.18)", fontSize: 12 }} formatter={(value: unknown) => [`AED ${value ?? 0}K`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="Total (K)" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} fill="url(#agentGradTotal)" />
                <Area type="monotone" dataKey="Collected (K)" stroke="#10b981" strokeWidth={2.5} fill="url(#agentGradCollected)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ═══════ Year-over-Year ═══════ */}
      {data.yearOverYear && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Year-over-Year Comparison</h2>
              <p className="text-sm text-muted-foreground">{data.yearOverYear.previousYear.year} vs {data.yearOverYear.currentYear.year}</p>
            </div>
          </div>
          <div className="h-[16rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: "Employers", [String(data.yearOverYear.previousYear.year)]: data.yearOverYear.previousYear.employerAchieved, [String(data.yearOverYear.currentYear.year)]: data.yearOverYear.currentYear.employerAchieved },
                { name: "Employees", [String(data.yearOverYear.previousYear.year)]: data.yearOverYear.previousYear.employeeAchieved, [String(data.yearOverYear.currentYear.year)]: data.yearOverYear.currentYear.employeeAchieved },
                { name: "Finance (K)", [String(data.yearOverYear.previousYear.year)]: Math.round(data.yearOverYear.previousYear.financeAchieved / 1000), [String(data.yearOverYear.currentYear.year)]: Math.round(data.yearOverYear.currentYear.financeAchieved / 1000) },
              ]} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} className="text-xs" />
                <YAxis axisLine={false} tickLine={false} className="text-xs" />
                <ReTooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                  contentStyle={{ borderRadius: "16px", borderColor: "rgba(148, 163, 184, 0.18)", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                <Bar dataKey={String(data.yearOverYear.previousYear.year)} fill="#94a3b8" radius={[8, 8, 0, 0]} />
                <Bar dataKey={String(data.yearOverYear.currentYear.year)} fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
