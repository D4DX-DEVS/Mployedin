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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import {
  Building2, Users,
  CalendarDays, RotateCcw, FileText, X,
  CircleDollarSign, Activity, Sparkles,
  ArrowUpRight, ArrowDownRight, Minus,
  AlertTriangle, TrendingUp, Award, Clock,
} from "lucide-react";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";

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
}

interface YearOverYear {
  currentYear: { year: number; employerTarget: number; employeeTarget: number; financeTarget: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; avgProgress: number; profileCount: number };
  previousYear: { year: number; employerTarget: number; employeeTarget: number; financeTarget: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; avgProgress: number; profileCount: number };
  growth: { employerTarget: number; employeeTarget: number; financeTarget: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; avgProgress: number };
}

interface BusinessVolumeItem {
  month: number;
  approved: number;
  pending: number;
  total: number;
  count: number;
}

interface QuarterlyItem {
  label: string;
  employerTarget: number;
  employerAchieved: number;
  employeeTarget: number;
  employeeAchieved: number;
  financeTarget: number;
  financeAchieved: number;
  businessVolume: number;
}

interface ProfileRow {
  _id: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  region?: string;
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
  overallProgress: number;
  riskScore: "high" | "medium" | "low";
  incentiveTier: string;
}

interface ReportData {
  year: number;
  monthlyTrend: MonthlyTrendItem[];
  yearOverYear: YearOverYear;
  businessVolume: BusinessVolumeItem[];
  totalBusinessVolume: number;
  totalApprovedVolume: number;
  quarterlyBreakdown: QuarterlyItem[];
  supervisorProfiles: ProfileRow[];
  agentProfiles: ProfileRow[];
  summary: { employerTarget: number; employeeTarget: number; financeTarget: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; avgProgress: number; profileCount: number };
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

export default function AdminTargetReportPage() {
  const currentYear = new Date().getFullYear();

  // Filters
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

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
      const res = await fetch(`/api/admin/target-report?year=${yearFilter}`);
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

  const hasActiveFilters = quarterFilter !== "all" || categoryFilter !== "all" || riskFilter !== "all" || roleFilter !== "all" || Boolean(searchQuery);

  function clearFilters() {
    setQuarterFilter("all");
    setCategoryFilter("all");
    setRiskFilter("all");
    setRoleFilter("all");
    setSearchQuery("");
  }

  // Filter data by quarter for charts
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

  // Filter profiles by risk + search
  const filteredProfiles = useMemo(() => {
    if (!data) return { supervisors: [] as ProfileRow[], agents: [] as ProfileRow[] };
    let supervisors = data.supervisorProfiles;
    let agents = data.agentProfiles;

    if (riskFilter !== "all") {
      supervisors = supervisors.filter((p) => p.riskScore === riskFilter);
      agents = agents.filter((p) => p.riskScore === riskFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      supervisors = supervisors.filter((p) => p.assigneeName.toLowerCase().includes(q) || p.assigneeEmail.toLowerCase().includes(q));
      agents = agents.filter((p) => p.assigneeName.toLowerCase().includes(q) || p.assigneeEmail.toLowerCase().includes(q));
    }
    return { supervisors, agents };
  }, [data, riskFilter, searchQuery]);

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
      "Pending (K)": Math.round(bv.pending / 1000),
      "Total (K)": Math.round(bv.total / 1000),
    }));
  }, [filteredBusinessVolume]);

  // Risk analytics
  const allProfilesList = useMemo(() => {
    if (!data) return [] as ProfileRow[];
    return [...data.supervisorProfiles, ...data.agentProfiles];
  }, [data]);

  const riskAnalytics = useMemo(() => {
    const team = allProfilesList;
    return {
      high: team.filter((r) => r.riskScore === "high").length,
      medium: team.filter((r) => r.riskScore === "medium").length,
      low: team.filter((r) => r.riskScore === "low").length,
      behind: team.filter((r) => r.overallProgress < 40).length,
      overperformers: team.filter((r) => r.overallProgress >= 80).length,
      topAgent: team.reduce<ProfileRow | null>((top, r) => (!top || r.financeAchieved > top.financeAchieved ? r : top), null),
    };
  }, [allProfilesList]);

  // Export via useTableExport (proper CSV / Excel / PDF)
  const allProfiles = useMemo(() => {
    if (!data) return [];
    return [...data.supervisorProfiles.map((p) => ({ ...p, role: "Supervisor" })), ...data.agentProfiles.map((p) => ({ ...p, role: "Agent" }))];
  }, [data]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Name", key: "assigneeName" },
    { header: "Email", key: "assigneeEmail" },
    { header: "Role", key: "role" },
    { header: "Region", key: "region", formatter: (v) => String(v ?? "—") },
    { header: "Employer Target", key: "employerTarget", formatter: (v) => String(v ?? 0) },
    { header: "Employer Achieved", key: "employerAchieved", formatter: (v) => String(v ?? 0) },
    { header: "Employee Target", key: "employeeTarget", formatter: (v) => String(v ?? 0) },
    { header: "Employee Achieved", key: "employeeAchieved", formatter: (v) => String(v ?? 0) },
    { header: "Finance Target", key: "financeTarget", formatter: (v) => String(v ?? 0) },
    { header: "Finance Achieved", key: "financeAchieved", formatter: (v) => String(v ?? 0) },
    { header: "Overall %", key: "overallProgress", formatter: (v) => `${v ?? 0}%` },
    { header: "Risk", key: "riskScore" },
    { header: "Incentive Tier", key: "incentiveTier" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: allProfiles as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: `target-report-${yearFilter}`,
    title: `Target Report ${yearFilter}`,
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

  if (!data) return null;

  return (
    <div className="page-container space-y-6 print:space-y-4">
      {/* ═══════ HERO ═══════ */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Admin workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Target Report</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Consolidated performance report — {yearFilter}. Track employer, employee, and finance targets across your organization.
            </p>
          </div>
          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[220px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coverage</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{data.summary.profileCount} profiles</p>
            <p className="text-xs text-muted-foreground">{data.supervisorProfiles.length} supervisors, {data.agentProfiles.length} agents tracked with {data.summary.avgProgress}% avg performance.</p>
          </div>
        </div>
      </section>

      {/* ═══════ KPI Summary ═══════ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30"><Building2 className="h-4 w-4" /></div>
            <GrowthIndicator value={data.yearOverYear.growth.employerAchieved} />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employer Target</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-600">{data.summary.employerAchieved} <span className="text-base font-normal text-muted-foreground">/ {data.summary.employerTarget}</span></p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{data.summary.employerTarget > 0 ? Math.round((data.summary.employerAchieved / data.summary.employerTarget) * 100) : 0}% complete</span>
            <span>{Math.max(0, data.summary.employerTarget - data.summary.employerAchieved)} pending</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/20">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${data.summary.employerTarget > 0 ? Math.min(100, Math.round((data.summary.employerAchieved / data.summary.employerTarget) * 100)) : 0}%` }} />
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30"><Users className="h-4 w-4" /></div>
            <GrowthIndicator value={data.yearOverYear.growth.employeeAchieved} />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employee Target</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-purple-600">{data.summary.employeeAchieved} <span className="text-base font-normal text-muted-foreground">/ {data.summary.employeeTarget}</span></p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{data.summary.employeeTarget > 0 ? Math.round((data.summary.employeeAchieved / data.summary.employeeTarget) * 100) : 0}% complete</span>
            <span>{Math.max(0, data.summary.employeeTarget - data.summary.employeeAchieved)} pending</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-purple-100 dark:bg-purple-900/20">
            <div className="h-full rounded-full bg-purple-500" style={{ width: `${data.summary.employeeTarget > 0 ? Math.min(100, Math.round((data.summary.employeeAchieved / data.summary.employeeTarget) * 100)) : 0}%` }} />
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"><CircleDollarSign className="h-4 w-4" /></div>
            <GrowthIndicator value={data.yearOverYear.growth.financeAchieved} />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Business Volume</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{formatCurrency(data.totalApprovedVolume, currencyCode)}</p>
          <p className="mt-2 text-xs text-muted-foreground">of {formatCurrency(data.totalBusinessVolume, currencyCode)} total</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/20">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${data.totalBusinessVolume > 0 ? Math.min(100, Math.round((data.totalApprovedVolume / data.totalBusinessVolume) * 100)) : 0}%` }} />
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30"><Activity className="h-4 w-4" /></div>
            <GrowthIndicator value={data.yearOverYear.growth.avgProgress} />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Performance</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-violet-600">{data.summary.avgProgress}%</p>
          <p className="mt-2 text-xs text-muted-foreground">{data.summary.profileCount} profiles tracked</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-violet-900/20">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, data.summary.avgProgress)}%` }} />
          </div>
        </div>
      </div>

      {/* ═══════ TOOLBAR ═══════ */}
      <TableToolbar
        title="Performance data"
        description="Filter by quarter, category, risk, or role."
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name or email…"
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
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="h-9 w-[130px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risks</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
                <SelectItem value="medium">Medium Risk</SelectItem>
                <SelectItem value="low">Low Risk</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-[140px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="supervisors">Supervisors</SelectItem>
                <SelectItem value="agents">Agents</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setYearFilter(currentYear)} disabled={yearFilter === currentYear} className="h-9 gap-1.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Reset Year
            </Button>
          </div>
        }
      />

      {/* ═══════ Section header ═══════ */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold tracking-tight">Performance Analytics</h2>
        <Badge variant="outline" className="text-xs">{quarterFilter !== "all" ? `Q${quarterFilter}` : `${yearFilter} — 12 months`}</Badge>
      </div>

      {/* ═══════ Chart A + B (2-up) ═══════ */}
      {(categoryFilter === "all" || categoryFilter === "employer" || categoryFilter === "employee") && (
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
      {(categoryFilter === "all" || categoryFilter === "finance") && (
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
                  <linearGradient id="adminGradFinTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="adminGradFinAchieved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} unit="K" />
                <ReTooltip contentStyle={{ borderRadius: "12px", borderColor: "rgba(148,163,184,0.18)", fontSize: 12 }} formatter={(value: unknown) => [`${value ?? 0}K`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="Target (K)" stroke="#6ee7b7" strokeDasharray="5 5" strokeWidth={2} fill="url(#adminGradFinTarget)" />
                <Area type="monotone" dataKey="Achieved (K)" stroke="#10b981" strokeWidth={2.5} fill="url(#adminGradFinAchieved)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ═══════ Revenue Intelligence ═══════ */}
      {(categoryFilter === "all" || categoryFilter === "finance") && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Revenue Intelligence — {yearFilter}</h3>
              <p className="text-xs text-muted-foreground">Monthly collected vs pending breakdown (AED thousands)</p>
            </div>
            <CircleDollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={businessVolumeChartData} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminGradCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="adminGradPending" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} unit="K" />
                <ReTooltip contentStyle={{ borderRadius: "12px", borderColor: "rgba(148,163,184,0.18)", fontSize: 12 }} formatter={(value: unknown) => [`AED ${value ?? 0}K`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="Total (K)" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} fill="none" />
                <Area type="monotone" dataKey="Pending (K)" stroke="#f59e0b" strokeWidth={2} fill="url(#adminGradPending)" />
                <Area type="monotone" dataKey="Collected (K)" stroke="#10b981" strokeWidth={2.5} fill="url(#adminGradCollected)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ═══════ Year-over-Year ═══════ */}
      <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Year-over-Year Comparison</h2>
            <p className="text-sm text-muted-foreground">{data.yearOverYear.previousYear.year} vs {data.yearOverYear.currentYear.year}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {([
            { label: "Emp. Target", curr: data.yearOverYear.currentYear.employerTarget, prev: data.yearOverYear.previousYear.employerTarget, growth: data.yearOverYear.growth.employerTarget },
            { label: "Emp. Achieved", curr: data.yearOverYear.currentYear.employerAchieved, prev: data.yearOverYear.previousYear.employerAchieved, growth: data.yearOverYear.growth.employerAchieved },
            { label: "Empl. Target", curr: data.yearOverYear.currentYear.employeeTarget, prev: data.yearOverYear.previousYear.employeeTarget, growth: data.yearOverYear.growth.employeeTarget },
            { label: "Empl. Achieved", curr: data.yearOverYear.currentYear.employeeAchieved, prev: data.yearOverYear.previousYear.employeeAchieved, growth: data.yearOverYear.growth.employeeAchieved },
            { label: "Fin. Target", curr: data.yearOverYear.currentYear.financeTarget, prev: data.yearOverYear.previousYear.financeTarget, growth: data.yearOverYear.growth.financeTarget, isCurrency: true },
            { label: "Fin. Achieved", curr: data.yearOverYear.currentYear.financeAchieved, prev: data.yearOverYear.previousYear.financeAchieved, growth: data.yearOverYear.growth.financeAchieved, isCurrency: true },
          ] as const).map((item) => (
            <div key={item.label} className="rounded-xl border border-border/50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{"isCurrency" in item && item.isCurrency ? formatCurrency(item.curr, currencyCode) : item.curr.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">was {"isCurrency" in item && item.isCurrency ? formatCurrency(item.prev, currencyCode) : item.prev.toLocaleString()}</p>
              <GrowthIndicator value={item.growth} />
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ Quarterly Breakdown ═══════ */}
      <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Quarterly Breakdown</h2>
            <p className="text-sm text-muted-foreground">Performance by quarter with business volume</p>
          </div>
          <Badge variant="outline">4 quarters</Badge>
        </div>
        <div className="h-[18rem] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.quarterlyBreakdown.map((q) => ({ name: q.label, Employer: q.employerAchieved, Employee: q.employeeAchieved, "Revenue (K)": Math.round(q.financeAchieved / 1000), "Volume (K)": Math.round(q.businessVolume / 1000) }))} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} className="text-xs" />
              <YAxis axisLine={false} tickLine={false} className="text-xs" />
              <ReTooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                contentStyle={{ borderRadius: "16px", borderColor: "rgba(148, 163, 184, 0.18)", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              <Bar dataKey="Employer" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Employee" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Revenue (K)" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Volume (K)" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ═══════ Risk & Performance Alerts ═══════ */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight">Risk & Performance Alerts</h2>
          <Badge variant="outline" className="text-xs">{allProfilesList.length} profiles analysed</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border bg-red-50 p-4 dark:bg-red-900/10">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30"><AlertTriangle className="h-4 w-4" /></div>
              <span className="text-3xl font-bold tabular-nums text-red-600">{riskAnalytics.high}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-400">High Risk</p>
            <p className="text-xs text-muted-foreground">{riskAnalytics.medium} medium · {riskAnalytics.low} low risk</p>
          </div>
          <div className="rounded-2xl border bg-amber-50 p-4 dark:bg-amber-900/10">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30"><Clock className="h-4 w-4" /></div>
              <span className="text-3xl font-bold tabular-nums text-amber-600">{riskAnalytics.behind}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-400">Behind Target</p>
            <p className="text-xs text-muted-foreground">Profiles below 40% progress</p>
          </div>
          <div className="rounded-2xl border bg-emerald-50 p-4 dark:bg-emerald-900/10">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"><TrendingUp className="h-4 w-4" /></div>
              <span className="text-3xl font-bold tabular-nums text-emerald-600">{riskAnalytics.overperformers}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Overperformers</p>
            <p className="text-xs text-muted-foreground">Profiles at 80%+ progress</p>
          </div>
          <div className="rounded-2xl border bg-violet-50 p-4 dark:bg-violet-900/10">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30"><Award className="h-4 w-4" /></div>
              <span className="text-xs font-bold text-violet-600 tabular-nums truncate max-w-[120px]">{riskAnalytics.topAgent?.assigneeName ?? "—"}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-violet-700 dark:text-violet-400">Revenue Leader</p>
            <p className="text-xs text-muted-foreground">{riskAnalytics.topAgent ? formatCurrency(riskAnalytics.topAgent.financeAchieved, currencyCode) : "No data"}</p>
          </div>
        </div>
      </section>

      {/* ═══════ Supervisor Table ═══════ */}
      {(roleFilter === "all" || roleFilter === "supervisors") && filteredProfiles.supervisors.length > 0 && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Supervisor Performance</h2>
              <p className="text-sm text-muted-foreground">{filteredProfiles.supervisors.length} supervisors ranked by progress</p>
            </div>
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">#</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">Supervisor</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">Region</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600">Employer</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-purple-600">Employee</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600">Finance</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Overall</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.supervisors.slice(0, 20).map((row, i) => (
                  <TableRow key={row._id}>
                    <TableCell className="text-sm font-bold tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.assigneeName}</p>
                      <p className="text-xs text-muted-foreground">{row.assigneeEmail}</p>
                      {row.incentiveTier && <p className="text-[10px] text-violet-500 font-medium">{row.incentiveTier}</p>}
                    </TableCell>
                    <TableCell className="text-sm">{row.region || "—"}</TableCell>
                    <TableCell className="text-center tabular-nums text-blue-600 font-medium">{row.employerAchieved}<span className="text-muted-foreground font-normal">/{row.employerTarget}</span></TableCell>
                    <TableCell className="text-center tabular-nums text-purple-600 font-medium">{row.employeeAchieved}<span className="text-muted-foreground font-normal">/{row.employeeTarget}</span></TableCell>
                    <TableCell className="text-center tabular-nums text-emerald-600 font-medium">{formatCurrency(row.financeAchieved, currencyCode)}</TableCell>
                    <TableCell className="text-center min-w-[80px]">
                      <span className={`text-sm font-bold tabular-nums ${row.overallProgress >= 75 ? "text-emerald-600" : row.overallProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>{row.overallProgress}%</span>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${row.overallProgress >= 75 ? "bg-emerald-500" : row.overallProgress >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, row.overallProgress)}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.riskScore === "high" ? "destructive" : row.riskScore === "medium" ? "secondary" : "outline"} className="text-[10px]">{row.riskScore}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* ═══════ Agent Table ═══════ */}
      {(roleFilter === "all" || roleFilter === "agents") && filteredProfiles.agents.length > 0 && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Agent Performance</h2>
              <p className="text-sm text-muted-foreground">{filteredProfiles.agents.length} agents ranked by progress</p>
            </div>
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">#</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">Agent</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600">Employer</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-purple-600">Employee</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600">Finance</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Overall</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.agents.slice(0, 30).map((row, i) => (
                  <TableRow key={row._id}>
                    <TableCell className="text-sm font-bold tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.assigneeName}</p>
                      <p className="text-xs text-muted-foreground">{row.assigneeEmail}</p>
                      {row.incentiveTier && <p className="text-[10px] text-violet-500 font-medium">{row.incentiveTier}</p>}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-blue-600 font-medium">{row.employerAchieved}<span className="text-muted-foreground font-normal">/{row.employerTarget}</span></TableCell>
                    <TableCell className="text-center tabular-nums text-purple-600 font-medium">{row.employeeAchieved}<span className="text-muted-foreground font-normal">/{row.employeeTarget}</span></TableCell>
                    <TableCell className="text-center tabular-nums text-emerald-600 font-medium">{formatCurrency(row.financeAchieved, currencyCode)}</TableCell>
                    <TableCell className="text-center min-w-[80px]">
                      <span className={`text-sm font-bold tabular-nums ${row.overallProgress >= 75 ? "text-emerald-600" : row.overallProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>{row.overallProgress}%</span>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${row.overallProgress >= 75 ? "bg-emerald-500" : row.overallProgress >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, row.overallProgress)}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.riskScore === "high" ? "destructive" : row.riskScore === "medium" ? "secondary" : "outline"} className="text-[10px]">{row.riskScore}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
