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
  CircleDollarSign, Activity,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  SuperAgentPageIntro,
  SuperAgentEmptyState,
} from "@/components/features/super-agent/WorkspacePage";
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

// MONTHS_SHORT resolved in component with useTranslations hook, see below

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

export default function SuperAgentTargetReportPage() {
  const t = useTranslations("targets");
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

  // Filters
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-agent/target-report?year=${yearFilter}`);
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

  // Chart data
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
      Total: Math.round(bv.total / 1000),
    }));
  }, [filteredBusinessVolume, monthsShort]);

  // Export via useTableExport
  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("csvHeaderAgent"), key: "assigneeName" },
    { header: t("csvHeaderEmployerTarget"), key: "employerTarget", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderEmployerAchieved"), key: "employerAchieved", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderEmployeeTarget"), key: "employeeTarget", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderEmployeeAchieved"), key: "employeeAchieved", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderFinanceTarget"), key: "financeTarget", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderFinanceAchieved"), key: "financeAchieved", formatter: (v) => String(v ?? 0) },
    { header: t("csvHeaderOverallPercent"), key: "overallProgress", formatter: (v) => `${v ?? 0}%` },
    { header: t("csvHeaderRisk"), key: "riskScore" },
    { header: t("platinum"), key: "incentiveTier" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: (data?.teamBreakdown ?? []) as unknown as Record<string, unknown>[],
    columns: exportColumns,
    filename: `target-report-team-${yearFilter}`,
    title: t("teamPerformance"),
  });

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-20 w-full animate-pulse rounded-3xl bg-muted/40" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container">
        <div className="space-y-6">
          <SuperAgentPageIntro
            title={t("targetReportTitle")}
            description={t("reportEmptyDescription")}
          />
          <div className="flex justify-center">
            <div className="text-center max-w-md">
              <SuperAgentEmptyState
                icon={<FileText className="h-12 w-12 text-muted-foreground" />}
                title={t("reportEmptyTitle")}
                description={t("reportEmptyDescription")}
              />
              <Button
                onClick={fetchReport}
                disabled={loading}
                className="mt-6 gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                {t("reportRetry")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const currency = data.ownProfile?.currency ?? "AED";

  return (
    <div className="page-container print:space-y-4">
      {/* ═══════ HERO ═══════ */}
      <SuperAgentPageIntro
        title={t("targetReportTitle")}
        description={t("teamReportHeroDescription", { year: yearFilter })}
        metrics={[
          { label: "Employer Target", value: `${data.summary.employerAchieved} / ${data.summary.employerTarget}`, icon: Building2 },
          { label: "Employee Target", value: `${data.summary.employeeAchieved} / ${data.summary.employeeTarget}`, icon: Users },
          { label: "Business Volume", value: formatCurrency(data.totalBusinessVolume, currency), icon: CircleDollarSign },
          { label: "Avg Performance", value: `${data.summary.avgProgress}%`, icon: Activity },
        ]}
        compact
      />

      {/* ═══════ FILTER CONTROLS ═══════ */}
      {/* Phones: 2-up grid — five stacked full-width controls pushed the first
          chart a whole screen down. */}
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(parseInt(e.target.value) || currentYear)} className="h-9 w-full sm:w-24 rounded-lg text-sm" />
        </div>
        <Select value={quarterFilter} onValueChange={setQuarterFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[130px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder={t("quarter")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allQuarters")}</SelectItem>
            <SelectItem value="1">{t("q1")}</SelectItem>
            <SelectItem value="2">{t("q2")}</SelectItem>
            <SelectItem value="3">{t("q3")}</SelectItem>
            <SelectItem value="4">{t("q4")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[140px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder={t("category")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCategories")}</SelectItem>
            <SelectItem value="employer">{t("metricEmployer")}</SelectItem>
            <SelectItem value="employee">{t("metricEmployee")}</SelectItem>
            <SelectItem value="finance">{t("metricRevenue")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[130px] rounded-lg border-border bg-card text-sm"><SelectValue placeholder={t("risk")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allRisks")}</SelectItem>
            <SelectItem value="high">{t("highRisk")}</SelectItem>
            <SelectItem value="medium">{t("mediumRisk")}</SelectItem>
            <SelectItem value="low">{t("lowRisk")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setYearFilter(currentYear)} disabled={yearFilter === currentYear} className="h-9 gap-1.5 text-xs max-sm:col-span-2 max-sm:justify-self-start">
          <RotateCcw className="h-3.5 w-3.5" /> {t("resetYear")}
        </Button>
      </div>

      {/* ═══════ TOOLBAR ROW ═══════ */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("searchAgentName")}
          className="h-9 min-w-0 flex-1 rounded-lg text-sm max-sm:min-h-11 max-sm:w-full max-sm:flex-none"
        />
        <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 gap-1.5 rounded-lg print:hidden max-sm:min-h-11">
          <FileText className="h-3.5 w-3.5" /> {t("print")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCsv} className="h-9 gap-1.5 rounded-lg text-xs max-sm:min-h-11">
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-9 gap-1.5 rounded-lg text-xs max-sm:min-h-11">
          Excel
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPdf} className="h-9 gap-1.5 rounded-lg text-xs max-sm:min-h-11">
          PDF
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground max-sm:min-h-11">
            <X className="h-3.5 w-3.5 mr-1" /> {t("clearFilters")}
          </Button>
        )}
      </div>

      {/* ═══════ Monthly Trend ═══════ */}
      <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid card-pad">
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
      <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid card-pad">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="heading-section font-semibold tracking-tight">{t("businessVolume", { year: yearFilter })}</h2>
            <p className="text-sm text-muted-foreground">{t("monthlyRevenue")}{quarterFilter !== "all" ? ` — Q${quarterFilter}` : ""}</p>
          </div>
          <CircleDollarSign className="h-5 w-5 text-primary" />
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={businessVolumeChartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gradApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
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
              <Area type="monotone" dataKey="Approved" stroke="#10b981" strokeWidth={2.5} fill="url(#gradApproved)" />
              <Area type="monotone" dataKey="Total" stroke="#3b82f6" strokeWidth={2} fill="url(#gradTotal)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ═══════ Year-over-Year ═══════ */}
      {data.yearOverYear && (
        <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid card-pad">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("yearOverYearComparison")}</h2>
              <p className="text-sm text-muted-foreground">{data.yearOverYear.previousYear.year} vs {data.yearOverYear.currentYear.year}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
            {([
              { label: "metricEmployer", curr: data.yearOverYear.currentYear.employerAchieved, prev: data.yearOverYear.previousYear.employerAchieved, growth: data.yearOverYear.growth.employerAchieved },
              { label: "metricEmployee", curr: data.yearOverYear.currentYear.employeeAchieved, prev: data.yearOverYear.previousYear.employeeAchieved, growth: data.yearOverYear.growth.employeeAchieved },
              { label: "metricRevenue", curr: data.yearOverYear.currentYear.financeAchieved, prev: data.yearOverYear.previousYear.financeAchieved, growth: data.yearOverYear.growth.financeAchieved, isCurrency: true },
              { label: "avgPerformance", curr: data.yearOverYear.currentYear.avgProgress, prev: data.yearOverYear.previousYear.avgProgress, growth: data.yearOverYear.growth.avgProgress, isPercent: true },
            ] as const).map((item) => (
              <div key={item.label} className="rounded-xl border border-border/50 text-center card-pad">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(item.label)}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {"isCurrency" in item && item.isCurrency ? formatCurrency(item.curr, currency) : "isPercent" in item && item.isPercent ? `${item.curr}%` : formatCount(item.curr)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("was")}{"isCurrency" in item && item.isCurrency ? formatCurrency(item.prev, currency) : "isPercent" in item && item.isPercent ? `${item.prev}%` : formatCount(item.prev)}
                </p>
                <GrowthIndicator value={item.growth} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════ Team Breakdown Table ═══════ */}
      {filteredTeam.length > 0 && (
        <section className="rounded-3xl border bg-card shadow-sm print:break-inside-avoid card-pad">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("teamPerformance")}</h2>
              <p className="text-sm text-muted-foreground">{t("agentsRankedByProgress", { count: filteredTeam.length })}</p>
            </div>
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">#</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em]">{t("agent")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("metricEmployer")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("metricEmployee")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("metricRevenue")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("overallProgress")}</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">{t("risk")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeam.map((row, i) => (
                  <TableRow key={row._id}>
                    <TableCell className="text-sm font-bold tabular-nums">{i + 1}</TableCell>
                    <TableCell><p className="font-medium">{row.assigneeName}</p></TableCell>
                    <TableCell className="text-center tabular-nums">{row.employerAchieved}/{row.employerTarget}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.employeeAchieved}/{row.employeeTarget}</TableCell>
                    <TableCell className="text-center tabular-nums">{formatCurrency(row.financeAchieved, currency)}</TableCell>
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
