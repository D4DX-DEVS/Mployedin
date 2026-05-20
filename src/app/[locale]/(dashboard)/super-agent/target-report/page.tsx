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
  const t = useTranslations("targets");
  const currentYear = new Date().getFullYear();

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

  // Chart data
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
      Total: Math.round(bv.total / 1000),
    }));
  }, [filteredBusinessVolume]);

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
  const currency = data.ownProfile?.currency ?? "AED";

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
      <SuperAgentMetricsGrid
        items={[
          { label: "Employer Target", value: `${data.summary.employerAchieved} / ${data.summary.employerTarget}`, helper: data.yearOverYear ? `${data.yearOverYear.growth.employerAchieved > 0 ? "+" : ""}${data.yearOverYear.growth.employerAchieved}% YoY` : "Year over year", icon: <Building2 className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
          { label: "Employee Target", value: `${data.summary.employeeAchieved} / ${data.summary.employeeTarget}`, helper: data.yearOverYear ? `${data.yearOverYear.growth.employeeAchieved > 0 ? "+" : ""}${data.yearOverYear.growth.employeeAchieved}% YoY` : "Year over year", icon: <Users className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
          { label: "Business Volume", value: formatCurrency(data.totalBusinessVolume, currency), helper: "Team total revenue", icon: <CircleDollarSign className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
          { label: "Avg Performance", value: `${data.summary.avgProgress}%`, helper: data.yearOverYear ? `${data.yearOverYear.growth.avgProgress > 0 ? "+" : ""}${data.yearOverYear.growth.avgProgress}% YoY` : "Year over year", icon: <Activity className="h-5 w-5" />, toneClassName: "workspace-tone-violet" },
        ]}
      />

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
                formatter={(value: any) => [`${value ?? 0}K`, ""]}
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

      {/* ═══════ Team Breakdown Table ═══════ */}
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
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Employer</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Employee</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Finance</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Overall</TableHead>
                  <TableHead className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]">Risk</TableHead>
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
