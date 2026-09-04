"use client";

import { useState, useEffect, useMemo } from "react";
import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { useQuery } from "@tanstack/react-query";
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
import { useLocale, useTranslations } from "next-intl";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { formatCount } from "@/lib/ui/intlFormat";

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


function formatCurrency(value: number, currency = "AED"): string {
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${formatCount(value)}`;
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
  const locale = useLocale();
  /* Chart axis labels are rendered inside the SVG, so a hardcoded English array
     left "Jan…Dec" sitting in the middle of the Arabic report. */
  const monthsShort = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "short" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2020, i, 1))));
  }, [locale]);
  const currentYear = new Date().getFullYear();

  // Filters
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Cached per year: revisiting the page paints from cache instead of
  // re-running the whole report aggregation behind a skeleton.
  const { data = null, isLoading: loading, isError } = useQuery<ReportData>({
    queryKey: ["admin", "target-report", yearFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/target-report?year=${yearFilter}`);
      if (!res.ok) throw new Error(`Target report error: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (isError) toast.error(t("failedToLoadReport"));
  }, [isError, t]);

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
      name: monthsShort[m.month - 1],
      ...(categoryFilter === "all" || categoryFilter === "employer" ? { "Employer Target": m.employerTarget, "Employer Achieved": m.employerAchieved } : {}),
      ...(categoryFilter === "all" || categoryFilter === "employee" ? { "Employee Target": m.employeeTarget, "Employee Achieved": m.employeeAchieved } : {}),
      ...(categoryFilter === "all" || categoryFilter === "finance" ? { "Finance Target (K)": Math.round(m.financeTarget / 1000), "Finance Achieved (K)": Math.round(m.financeAchieved / 1000) } : {}),
    }));
  }, [filteredTrend, categoryFilter, monthsShort]);

  const businessVolumeChartData = useMemo(() => {
    return filteredBusinessVolume.map((bv) => ({
      name: monthsShort[bv.month - 1],
      Approved: Math.round(bv.approved / 1000),
      Pending: Math.round(bv.pending / 1000),
      Total: Math.round(bv.total / 1000),
    }));
  }, [filteredBusinessVolume, monthsShort]);

  // Export via useTableExport (proper CSV / Excel / PDF)
  const allProfiles = useMemo(() => {
    if (!data) return [];
    return [...data.supervisorProfiles.map((p) => ({ ...p, role: "Supervisor" })), ...data.agentProfiles.map((p) => ({ ...p, role: "Agent" }))];
  }, [data]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("name"), key: "assigneeName" },
    { header: t("email"), key: "assigneeEmail" },
    { header: t("exportHeaderRole"), key: "role" },
    { header: t("exportHeaderRegion"), key: "region", formatter: (v) => String(v ?? "—") },
    { header: t("csvHeaderEmployerTarget"), key: "employerTarget", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderEmployerAchieved"), key: "employerAchieved", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderEmployeeTarget"), key: "employeeTarget", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderEmployeeAchieved"), key: "employeeAchieved", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderFinanceTarget"), key: "financeTarget", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderFinanceAchieved"), key: "financeAchieved", formatter: (v) => String(v ?? 0) },
    { header: t("exportHeaderOverallPercent"), key: "overallProgress", formatter: (v) => `${v ?? 0}%` },
    { header: t("exportHeaderRisk"), key: "riskScore" },
    { header: t("exportHeaderIncentiveTier"), key: "incentiveTier" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: allProfiles as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: `target-report-${yearFilter}`,
    title: `Target Report ${yearFilter}`,
  });

  if (loading) {
    return (
      <div className="page-container">
      <ReportTabs />
        <div className="h-20 w-full animate-pulse rounded-3xl bg-muted/40" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
    <div className="page-container print:space-y-4">
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={Activity}
        title={t("targetReportTitle")}
        description={t("consolidatedPerformanceReport", { year: yearFilter })}
        summary={{
          label: t("coverageLabel"),
          value: t("profilesCoverage", { count: data.summary.profileCount }),
          note: t("profilesCount", { supervisors: data.supervisorProfiles.length, agents: data.agentProfiles.length, avgProgress: data.summary.avgProgress }),
        }}
      />

      {/* ═══════ KPI Summary ═══════ */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workspace-glass-panel card-pad rounded-2xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("csvHeaderEmployerTarget")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{data.summary.employerAchieved} <span className="text-base text-muted-foreground">/ {data.summary.employerTarget}</span></p>
              <GrowthIndicator value={data.yearOverYear.growth.employerAchieved} />
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5"><Building2 className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel card-pad rounded-2xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("csvHeaderEmployeeTarget")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{data.summary.employeeAchieved} <span className="text-base text-muted-foreground">/ {data.summary.employeeTarget}</span></p>
              <GrowthIndicator value={data.yearOverYear.growth.employeeAchieved} />
            </div>
            <div className="workspace-tone-emerald rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel card-pad rounded-2xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("businessVolumeTitle", { year: yearFilter })}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(data.totalApprovedVolume)}</p>
              <p className="text-xs text-muted-foreground">of {formatCurrency(data.totalBusinessVolume)} total</p>
            </div>
            <div className="workspace-tone-amber rounded-2xl p-2.5"><CircleDollarSign className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="workspace-glass-panel card-pad rounded-2xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("avgPerformanceLabel")}</p>
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
        description={t("filterByQuarterCategoryRisk")}
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name or email…"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        hasActiveFilters={hasActiveFilters}
        right={
          <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 gap-1.5 rounded-lg print:hidden">
            <FileText className="h-3.5 w-3.5" /> {t("print")}
          </Button>
        }
        actions={hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">
            <X className="h-3.5 w-3.5 mr-1" /> {t("actionClearFilters")}
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
                <SelectItem value="all">{t("allQuarters")}</SelectItem>
                <SelectItem value="1">{t("q1Quarter")}</SelectItem>
                <SelectItem value="2">{t("q2Quarter")}</SelectItem>
                <SelectItem value="3">{t("q3Quarter")}</SelectItem>
                <SelectItem value="4">{t("q4Quarter")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[140px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCategories")}</SelectItem>
                <SelectItem value="employer">{t("categoryEmployer")}</SelectItem>
                <SelectItem value="employee">{t("categoryEmployee")}</SelectItem>
                <SelectItem value="finance">{t("categoryFinance")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="h-9 w-[130px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allRisks")}</SelectItem>
                <SelectItem value="high">{t("highRiskFilter")}</SelectItem>
                <SelectItem value="medium">{t("mediumRiskFilter")}</SelectItem>
                <SelectItem value="low">{t("lowRiskFilter")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-[140px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allRoles")}</SelectItem>
                <SelectItem value="supervisors">{t("supervisorsRole")}</SelectItem>
                <SelectItem value="agents">{t("agentsRole")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setYearFilter(currentYear)} disabled={yearFilter === currentYear} className="h-9 gap-1.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> {t("resetYearButton")}
            </Button>
          </div>
        }
      />

      {/* ═══════ Monthly Trend ═══════ */}
      <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid panel-body">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="heading-section font-semibold tracking-tight">{t("monthlyPerformanceTimeline")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("targetVsAchieved")}{quarterFilter !== "all" ? ` — Q${quarterFilter}` : ""}{categoryFilter !== "all" ? ` — ${categoryFilter} only` : ""}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">{quarterFilter !== "all" ? `Q${quarterFilter}` : t("twelveMonths")}</Badge>
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
                  <Line type="monotone" dataKey="Employer Target" name={t("employerTargetSeries")} stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Employer Achieved" name={t("employerAchievedSeries")} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5 }} />
                </>
              )}
              {(categoryFilter === "all" || categoryFilter === "employee") && (
                <>
                  <Line type="monotone" dataKey="Employee Target" name={t("employeeTargetSeries")} stroke="#c4b5fd" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Employee Achieved" name={t("employeeAchievedSeries")} stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: "#8b5cf6" }} activeDot={{ r: 5 }} />
                </>
              )}
              {(categoryFilter === "all" || categoryFilter === "finance") && (
                <>
                  <Line type="monotone" dataKey="Finance Target (K)" name={t("financeTargetKSeries")} stroke="#fde68a" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Finance Achieved (K)" name={t("financeAchievedKSeries")} stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b" }} activeDot={{ r: 5 }} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ═══════ Business Volume ═══════ */}
      <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid panel-body">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="heading-section font-semibold tracking-tight">{t("businessVolumeTitle", { year: yearFilter })}</h2>
            <p className="text-sm text-muted-foreground">{t("monthlyRevenueThousands")}{quarterFilter !== "all" ? ` — Q${quarterFilter}` : ""}</p>
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
              <Area type="monotone" dataKey="Approved" name={t("approvedSeries")} stackId="1" stroke="#10b981" strokeWidth={2.5} fill="url(#adminGradApproved)" />
              <Area type="monotone" dataKey="Pending" name={t("pendingSeries")} stackId="1" stroke="#f59e0b" strokeWidth={2} fill="url(#adminGradPending)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ═══════ Year-over-Year ═══════ */}
      <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid panel-body">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="heading-section font-semibold tracking-tight">{t("yearOverYearComparison")}</h2>
            <p className="text-sm text-muted-foreground">{t("yearsComparison", { prevYear: data.yearOverYear.previousYear.year, currYear: data.yearOverYear.currentYear.year })}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {([
            { id: "empTarget", label: t("yoyEmployerTarget"), curr: data.yearOverYear.currentYear.employerTarget, prev: data.yearOverYear.previousYear.employerTarget, growth: data.yearOverYear.growth.employerTarget },
            { id: "empAchieved", label: t("yoyEmployerAchieved"), curr: data.yearOverYear.currentYear.employerAchieved, prev: data.yearOverYear.previousYear.employerAchieved, growth: data.yearOverYear.growth.employerAchieved },
            { id: "emplTarget", label: t("yoyEmployeeTarget"), curr: data.yearOverYear.currentYear.employeeTarget, prev: data.yearOverYear.previousYear.employeeTarget, growth: data.yearOverYear.growth.employeeTarget },
            { id: "emplAchieved", label: t("yoyEmployeeAchieved"), curr: data.yearOverYear.currentYear.employeeAchieved, prev: data.yearOverYear.previousYear.employeeAchieved, growth: data.yearOverYear.growth.employeeAchieved },
            { id: "finTarget", label: t("yoyFinanceTarget"), curr: data.yearOverYear.currentYear.financeTarget, prev: data.yearOverYear.previousYear.financeTarget, growth: data.yearOverYear.growth.financeTarget, isCurrency: true },
            { id: "finAchieved", label: t("yoyFinanceAchieved"), curr: data.yearOverYear.currentYear.financeAchieved, prev: data.yearOverYear.previousYear.financeAchieved, growth: data.yearOverYear.growth.financeAchieved, isCurrency: true },
          ] as const).map((item) => (
            <div key={item.id} className="rounded-xl border border-border/50 text-center chip-pad">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{"isCurrency" in item && item.isCurrency ? formatCurrency(item.curr) : formatCount(item.curr)}</p>
              <p className="text-xs text-muted-foreground">was {"isCurrency" in item && item.isCurrency ? formatCurrency(item.prev) : formatCount(item.prev)}</p>
              <GrowthIndicator value={item.growth} />
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ Quarterly Breakdown ═══════ */}
      <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid panel-body">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="heading-section font-semibold tracking-tight">{t("quarterlyBreakdownTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("quarterlyBreakdownDescription")}</p>
          </div>
          <Badge variant="outline">{t("quarterCount")}</Badge>
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
              <Bar dataKey="Employer" name={t("employerBarSeries")} fill="#3b82f6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Employee" name={t("employeeBarSeries")} fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Revenue (K)" name={t("revenueKSeries")} fill="#f59e0b" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Volume (K)" name={t("volumeKSeries")} fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ═══════ Supervisor Table ═══════ */}
      {(roleFilter === "all" || roleFilter === "supervisors") && filteredProfiles.supervisors.length > 0 && (
        <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid panel-body">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("supervisorPerformance")}</h2>
              <p className="text-sm text-muted-foreground">{t("supervisorPerformanceDesc", { count: filteredProfiles.supervisors.length })}</p>
            </div>
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">#</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">{t("supervisor")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">{t("region")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("employer")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("employee")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("finance")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("overall")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("risk")}</TableHead>
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
                      <Badge variant={row.riskScore === "high" ? "destructive" : row.riskScore === "medium" ? "secondary" : "outline"} className="text-[11px]">{row.riskScore}</Badge>
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
        <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid panel-body">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("agentPerformance")}</h2>
              <p className="text-sm text-muted-foreground">{t("agentPerformanceDesc", { count: filteredProfiles.agents.length })}</p>
            </div>
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">#</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">{t("agent")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("employer")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("employee")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("finance")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("overall")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("risk")}</TableHead>
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
                      <Badge variant={row.riskScore === "high" ? "destructive" : row.riskScore === "medium" ? "secondary" : "outline"} className="text-[11px]">{row.riskScore}</Badge>
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
