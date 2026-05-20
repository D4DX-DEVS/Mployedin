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
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import {
  Building2, Users,
  CalendarDays, RotateCcw, FileText, X,
  CircleDollarSign, Activity,
  ArrowUpRight, ArrowDownRight, Minus,
  AlertTriangle, TrendingUp, Award, Clock,
} from "lucide-react";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid,
} from "@/components/features/super-agent/WorkspacePage";

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
  currentYear: { year: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; avgProgress: number };
  previousYear: { year: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; avgProgress: number };
  growth: { employerAchieved: number; employeeAchieved: number; financeAchieved: number; avgProgress: number };
}

interface BusinessVolumeItem {
  month: number;
  approved: number;
  total: number;
  count: number;
}

interface TeamRow {
  _id: string;
  assigneeId: string;
  assigneeName: string;
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

interface OwnProfile {
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  employerAchieved: number;
  employeeAchieved: number;
  financeAchieved: number;
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
  teamBreakdown: TeamRow[];
  summary: { employerTarget: number; employeeTarget: number; financeTarget: number; employerAchieved: number; employeeAchieved: number; financeAchieved: number; avgProgress: number };
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

export default function SuperAgentTargetReportPage() {
  const currentYear = new Date().getFullYear();

  // Filters
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    fetch("/api/super-agent/profile")
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
      const res = await fetch(`/api/super-agent/target-report?year=${yearFilter}`);
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

  const hasActiveFilters = quarterFilter !== "all" || categoryFilter !== "all" || riskFilter !== "all" || Boolean(searchQuery);

  function clearFilters() {
    setQuarterFilter("all");
    setCategoryFilter("all");
    setRiskFilter("all");
    setSearchQuery("");
  }

  // Filter data by quarter
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

  // Filter team breakdown by risk + search
  const filteredTeam = useMemo(() => {
    if (!data) return [];
    let team = data.teamBreakdown;
    if (riskFilter !== "all") {
      team = team.filter((r) => r.riskScore === riskFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      team = team.filter((r) => r.assigneeName.toLowerCase().includes(q));
    }
    return team;
  }, [data, riskFilter, searchQuery]);

  // Chart data — 3 separate series (never mixed)
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

  // Risk analytics derived from team
  const riskAnalytics = useMemo(() => {
    if (!data) return { high: 0, medium: 0, low: 0, behind: 0, overperformers: 0, topAgent: null as TeamRow | null };
    const team = data.teamBreakdown;
    return {
      high: team.filter((r) => r.riskScore === "high").length,
      medium: team.filter((r) => r.riskScore === "medium").length,
      low: team.filter((r) => r.riskScore === "low").length,
      behind: team.filter((r) => r.overallProgress < 40).length,
      overperformers: team.filter((r) => r.overallProgress >= 80).length,
      topAgent: team.reduce<TeamRow | null>((top, r) => (!top || r.financeAchieved > top.financeAchieved ? r : top), null),
    };
  }, [data]);

  // Export via useTableExport
  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Agent", key: "assigneeName" },
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
    data: (data?.teamBreakdown ?? []) as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: `target-report-team-${yearFilter}`,
    title: `Team Target Report ${yearFilter}`,
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
  const currency = currencyCode;

  return (
    <div className="page-container space-y-6 print:space-y-4">
      {/* ═══════ HERO ═══════ */}
      <SuperAgentPageIntro
        title="Target Report"
        description={`Team performance report — ${yearFilter}. Track your agents' employer, employee, and finance targets.`}
        eyebrow="Targets workspace"
        summaryTitle="Team coverage"
        summaryDescription={`${data.teamBreakdown.length} agents tracked across employer, employee, and finance targets with ${data.summary.avgProgress}% average performance.`}
      />

      {/* ═══════ KPI Summary ═══════ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Employer KPI */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30">
              <Building2 className="h-4 w-4" />
            </div>
            <GrowthIndicator value={data.yearOverYear?.growth.employerAchieved ?? 0} />
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
        {/* Employee KPI */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30">
              <Users className="h-4 w-4" />
            </div>
            <GrowthIndicator value={data.yearOverYear?.growth.employeeAchieved ?? 0} />
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
        {/* Finance KPI */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30">
              <CircleDollarSign className="h-4 w-4" />
            </div>
            <GrowthIndicator value={data.yearOverYear?.growth.financeAchieved ?? 0} />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Business Volume</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{formatCurrency(data.totalBusinessVolume, currency)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Team total revenue</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/20">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${data.summary.financeTarget > 0 ? Math.min(100, Math.round((data.summary.financeAchieved / data.summary.financeTarget) * 100)) : 0}%` }} />
          </div>
        </div>
        {/* Avg Performance KPI */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30">
              <Activity className="h-4 w-4" />
            </div>
            <GrowthIndicator value={data.yearOverYear?.growth.avgProgress ?? 0} />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Performance</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-violet-600">{data.summary.avgProgress}%</p>
          <p className="mt-2 text-xs text-muted-foreground">{data.teamBreakdown.length} agents tracked</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-violet-900/20">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, data.summary.avgProgress)}%` }} />
          </div>
        </div>
      </div>

      {/* ═══════ TOOLBAR ═══════ */}
      <TableToolbar
        title="Performance data"
        description="Filter by quarter, category, or risk level to narrow results."
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search agent name…"
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
          {/* Employer Chart */}
          {(categoryFilter === "all" || categoryFilter === "employer") && (
            <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30">
                  <Building2 className="h-4 w-4" />
                </div>
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
          {/* Employee Chart */}
          {(categoryFilter === "all" || categoryFilter === "employee") && (
            <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30">
                  <Users className="h-4 w-4" />
                </div>
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

      {/* ═══════ Chart C — Finance Revenue (full-width, AED only) ═══════ */}
      {(categoryFilter === "all" || categoryFilter === "finance") && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30">
                <CircleDollarSign className="h-4 w-4" />
              </div>
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
                  <linearGradient id="gradFinTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradFinAchieved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} unit="K" />
                <ReTooltip
                  contentStyle={{ borderRadius: "12px", borderColor: "rgba(148,163,184,0.18)", fontSize: 12 }}
                  formatter={(value: unknown) => [`${value ?? 0}K`, ""]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="Target (K)" stroke="#6ee7b7" strokeDasharray="5 5" strokeWidth={2} fill="url(#gradFinTarget)" />
                <Area type="monotone" dataKey="Achieved (K)" stroke="#10b981" strokeWidth={2.5} fill="url(#gradFinAchieved)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ═══════ Finance Intelligence ═══════ */}
      {(categoryFilter === "all" || categoryFilter === "finance") && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Revenue Intelligence — {yearFilter}</h3>
              <p className="text-xs text-muted-foreground">Monthly invoiced vs collected breakdown</p>
            </div>
            <CircleDollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={businessVolumeChartData} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradInvoiced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} unit="K" />
                <ReTooltip
                  contentStyle={{ borderRadius: "12px", borderColor: "rgba(148,163,184,0.18)", fontSize: 12 }}
                  formatter={(value: unknown) => [`AED ${value ?? 0}K`, ""]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="Total (K)" stroke="#3b82f6" strokeWidth={2} fill="url(#gradInvoiced)" />
                <Area type="monotone" dataKey="Collected (K)" stroke="#10b981" strokeWidth={2.5} fill="url(#gradCollected)" />
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {([
              { label: "Employers", curr: data.yearOverYear.currentYear.employerAchieved, prev: data.yearOverYear.previousYear.employerAchieved, growth: data.yearOverYear.growth.employerAchieved },
              { label: "Employees", curr: data.yearOverYear.currentYear.employeeAchieved, prev: data.yearOverYear.previousYear.employeeAchieved, growth: data.yearOverYear.growth.employeeAchieved },
              { label: "Revenue", curr: data.yearOverYear.currentYear.financeAchieved, prev: data.yearOverYear.previousYear.financeAchieved, growth: data.yearOverYear.growth.financeAchieved, isCurrency: true },
              { label: "Avg Progress", curr: data.yearOverYear.currentYear.avgProgress, prev: data.yearOverYear.previousYear.avgProgress, growth: data.yearOverYear.growth.avgProgress, isPercent: true },
            ] as const).map((item) => (
              <div key={item.label} className="rounded-xl border border-border/50 p-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {"isCurrency" in item && item.isCurrency ? formatCurrency(item.curr, currency) : "isPercent" in item && item.isPercent ? `${item.curr}%` : item.curr.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  was {"isCurrency" in item && item.isCurrency ? formatCurrency(item.prev, currency) : "isPercent" in item && item.isPercent ? `${item.prev}%` : item.prev.toLocaleString()}
                </p>
                <GrowthIndicator value={item.growth} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════ Risk Analytics ═══════ */}
      {data.teamBreakdown.length > 0 && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-semibold tracking-tight">Risk & Performance Alerts</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3 dark:border-red-900/30 dark:bg-red-900/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">High Risk</p>
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              </div>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-red-600">{riskAnalytics.high}</p>
              <p className="text-xs text-red-500/80">agents need attention</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 dark:border-amber-900/30 dark:bg-amber-900/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Behind Target</p>
                <Clock className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-600">{riskAnalytics.behind}</p>
              <p className="text-xs text-amber-500/80">below 40% progress</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-900/30 dark:bg-emerald-900/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Overperformers</p>
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <p className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-600">{riskAnalytics.overperformers}</p>
              <p className="text-xs text-emerald-500/80">above 80% progress</p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3 dark:border-violet-900/30 dark:bg-violet-900/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">Revenue Leader</p>
                <Award className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <p className="mt-1.5 text-sm font-bold text-violet-600 truncate">{riskAnalytics.topAgent?.assigneeName ?? "—"}</p>
              <p className="text-xs text-violet-500/80">{riskAnalytics.topAgent ? formatCurrency(riskAnalytics.topAgent.financeAchieved, currency) : "No data"}</p>
            </div>
          </div>
        </section>
      )}

      {/* ═══════ Team Performance Table ═══════ */}
      {filteredTeam.length > 0 && (
        <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Team Performance</h2>
              <p className="text-sm text-muted-foreground">{filteredTeam.length} agents ranked by progress</p>
            </div>
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">#</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">Agent</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600">Employers</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-purple-600">Placements</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600">Revenue</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Performance</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeam.map((row, i) => {
                  const pct = row.overallProgress;
                  return (
                    <TableRow key={row._id}>
                      <TableCell className="text-sm font-bold tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium">{row.assigneeName}</p>
                        <p className="text-xs text-muted-foreground">{row.incentiveTier}</p>
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-blue-700 dark:text-blue-400 font-medium">
                        {row.employerAchieved}<span className="text-muted-foreground font-normal">/{row.employerTarget}</span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-purple-700 dark:text-purple-400 font-medium">
                        {row.employeeAchieved}<span className="text-muted-foreground font-normal">/{row.employeeTarget}</span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                        {formatCurrency(row.financeAchieved, currency)}
                      </TableCell>
                      <TableCell className="text-center min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-sm font-bold tabular-nums ${pct >= 75 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full rounded-full ${pct >= 75 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={row.riskScore === "high" ? "destructive" : row.riskScore === "medium" ? "secondary" : "outline"} className={`text-[10px] ${row.riskScore === "low" ? "border-emerald-200 text-emerald-700 dark:text-emerald-400" : ""}`}>{row.riskScore}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
