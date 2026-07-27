"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
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
  CircleDollarSign, Activity,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("targets");
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

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/target-report?year=${yearFilter}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        toast.error(t("failedToLoadReport"));
      }
    } catch {
      toast.error(t("failedToLoadReport"));
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

  // Chart data (respects category + quarter filters)
  const trendChartData = useMemo(() => {
    return filteredTrend.map((m) => ({
      name: MONTHS_SHORT[m.month - 1],
      ...(categoryFilter === "all" || categoryFilter === "employer" ? { "Employer Target": m.employerTarget, "Employer Achieved": m.employerAchieved } : {}),
      ...(categoryFilter === "all" || categoryFilter === "employee" ? { "Employee Target": m.employeeTarget, "Employee Achieved": m.employeeAchieved } : {}),
      ...(categoryFilter === "all" || categoryFilter === "finance" ? { "Finance Target (K)": Math.round(m.financeTarget / 1000), "Finance Achieved (K)": Math.round(m.financeAchieved / 1000) } : {}),
    }));
  }, [filteredTrend, categoryFilter]);

  const businessVolumeChartData = useMemo(() => {
    return filteredBusinessVolume.map((bv) => ({
      name: MONTHS_SHORT[bv.month - 1],
      Approved: Math.round(bv.approved / 1000),
      Pending: Math.round(bv.pending / 1000),
      Total: Math.round(bv.total / 1000),
    }));
  }, [filteredBusinessVolume]);

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
      <DashboardPageHeader
        icon={Activity}
        eyebrow="Admin workspace"
        title="Target Report"
        description={`Consolidated performance report — ${yearFilter}. Track employer, employee, and finance targets across your organization.`}
        summary={{
          label: "Coverage",
          value: `${data.summary.profileCount} profiles`,
          note: `${data.supervisorProfiles.length} supervisors, ${data.agentProfiles.length} agents · ${data.summary.avgProgress}% average`,
        }}
      />

      {/* ═══════ KPI Summary ═══════ */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employer Target</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{data.summary.employerAchieved} <span className="text-base text-muted-foreground">/ {data.summary.employerTarget}</span></p>
              <GrowthIndicator value={data.yearOverYear.growth.employerAchieved} />
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5"><Building2 className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee Target</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{data.summary.employeeAchieved} <span className="text-base text-muted-foreground">/ {data.summary.employeeTarget}</span></p>
              <GrowthIndicator value={data.yearOverYear.growth.employeeAchieved} />
            </div>
            <div className="workspace-tone-emerald rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Business Volume</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(data.totalApprovedVolume)}</p>
              <p className="text-xs text-muted-foreground">of {formatCurrency(data.totalBusinessVolume)} total</p>
            </div>
            <div className="workspace-tone-amber rounded-2xl p-2.5"><CircleDollarSign className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg Performance</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{data.summary.avgProgress}%</p>
              <GrowthIndicator value={data.yearOverYear.growth.avgProgress} />
            </div>
            <div className="workspace-tone-violet rounded-2xl p-2.5"><Activity className="h-5 w-5" /></div>
          </div>
        </div>
      </section>

      {/* ═══════ TOOLBAR ═══════ */}
      <TableToolbar
        title={t("performanceDataTitle")}
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

      {/* ═══════ Monthly Trend ═══════ */}
      <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Monthly Performance Timeline</h2>
            <p className="text-sm text-muted-foreground">
              Target vs achieved{quarterFilter !== "all" ? ` — Q${quarterFilter}` : ""}{categoryFilter !== "all" ? ` — ${categoryFilter} only` : ""}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">{quarterFilter !== "all" ? `Q${quarterFilter}` : "12 months"}</Badge>
        </div>
        <div className="h-[22rem] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendChartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} className="text-xs" />
              <YAxis axisLine={false} tickLine={false} className="text-xs" />
              <ReTooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                contentStyle={{ borderRadius: "16px", borderColor: "rgba(148, 163, 184, 0.18)", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              {(categoryFilter === "all" || categoryFilter === "employer") && (
                <>
                  <Line type="monotone" dataKey="Employer Target" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Employer Achieved" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5 }} />
                </>
              )}
              {(categoryFilter === "all" || categoryFilter === "employee") && (
                <>
                  <Line type="monotone" dataKey="Employee Target" stroke="#c4b5fd" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Employee Achieved" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: "#8b5cf6" }} activeDot={{ r: 5 }} />
                </>
              )}
              {(categoryFilter === "all" || categoryFilter === "finance") && (
                <>
                  <Line type="monotone" dataKey="Finance Target (K)" stroke="#fde68a" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Finance Achieved (K)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b" }} activeDot={{ r: 5 }} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ═══════ Business Volume ═══════ */}
      <section className="rounded-3xl border bg-card p-5 shadow-sm print:break-inside-avoid">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Business Volume — {yearFilter}</h2>
            <p className="text-sm text-muted-foreground">Monthly revenue (thousands){quarterFilter !== "all" ? ` — Q${quarterFilter}` : ""}</p>
          </div>
          <CircleDollarSign className="h-5 w-5 text-primary" />
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={businessVolumeChartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="adminGradApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="adminGradPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} className="text-xs" />
              <YAxis axisLine={false} tickLine={false} className="text-xs" unit="K" />
              <ReTooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                contentStyle={{ borderRadius: "16px", borderColor: "rgba(148, 163, 184, 0.18)", fontSize: 12 }}
                formatter={(value) => [`${value}K`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              <Area type="monotone" dataKey="Approved" stackId="1" stroke="#10b981" strokeWidth={2.5} fill="url(#adminGradApproved)" />
              <Area type="monotone" dataKey="Pending" stackId="1" stroke="#f59e0b" strokeWidth={2} fill="url(#adminGradPending)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

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
              <p className="mt-1 text-lg font-bold tabular-nums">{"isCurrency" in item && item.isCurrency ? formatCurrency(item.curr) : item.curr.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">was {"isCurrency" in item && item.isCurrency ? formatCurrency(item.prev) : item.prev.toLocaleString()}</p>
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
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Employer</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Employee</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Finance</TableHead>
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
                    </TableCell>
                    <TableCell className="text-sm">{row.region || "—"}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.employerAchieved}/{row.employerTarget}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.employeeAchieved}/{row.employeeTarget}</TableCell>
                    <TableCell className="text-center tabular-nums">{formatCurrency(row.financeAchieved)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-bold tabular-nums ${row.overallProgress >= 75 ? "text-emerald-600" : row.overallProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>{row.overallProgress}%</span>
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
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Employer</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Employee</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Finance</TableHead>
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
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{row.employerAchieved}/{row.employerTarget}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.employeeAchieved}/{row.employeeTarget}</TableCell>
                    <TableCell className="text-center tabular-nums">{formatCurrency(row.financeAchieved)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-bold tabular-nums ${row.overallProgress >= 75 ? "text-emerald-600" : row.overallProgress >= 40 ? "text-amber-600" : "text-red-500"}`}>{row.overallProgress}%</span>
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
