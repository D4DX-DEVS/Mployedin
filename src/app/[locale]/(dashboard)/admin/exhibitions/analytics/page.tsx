"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Percent,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/currency";

interface KPIs {
  totalRequests: number;
  submitted: number;
  approved: number;
  rejected: number;
  completed: number;
  underReview: number;
  approvalRate: number;
  totalEstimatedBudget: number;
  totalApprovedBudget: number;
  totalActualSpend: number;
  avgBudget: number;
  budgetVariance: number;
}

interface PerformanceData {
  totalLeads: number;
  totalEmployers: number;
  totalCandidates: number;
  totalHires: number;
  totalRevenue: number;
  totalCost: number;
  roi: number;
  eventsReported: number;
}

interface MonthlyPoint {
  month: string;
  submitted: number;
  approved: number;
  completed: number;
  rejected: number;
  total: number;
}

interface ParticipationItem {
  type: string;
  count: number;
}

interface TopAgent {
  agentId: string;
  name: string;
  total: number;
  approved: number;
  approvalRate: number;
  totalBudget: number;
}

interface AnalyticsData {
  year: number;
  kpis: KPIs;
  performance: PerformanceData;
  monthly: MonthlyPoint[];
  participation: ParticipationItem[];
  topAgents: TopAgent[];
}

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => {
  const year = new Date().getFullYear() - index;
  return { value: String(year), label: String(year) };
});

const PARTICIPATION_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#7c3aed",
  "#ef4444",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
];

const DEFAULT_PERFORMANCE: PerformanceData = {
  totalLeads: 0,
  totalEmployers: 0,
  totalCandidates: 0,
  totalHires: 0,
  totalRevenue: 0,
  totalCost: 0,
  roi: 0,
  eventsReported: 0,
};

export default function AdminExhibitionAnalyticsPage() {
  const t = useTranslations("adminExhibitionsAnalytics");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [currencyCode, setCurrencyCode] = useState("AED");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/admin/settings", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load admin settings");
        }

        return response.json();
      })
      .then((payload) => {
        if (payload?.settings?.defaultCurrency) {
          setCurrencyCode(payload.settings.defaultCurrency);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        toast.error(t("errorLoadingSettings"));
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const parsedYear = Number.parseInt(year, 10);

    if (!Number.isInteger(parsedYear) || parsedYear < 2020 || parsedYear > new Date().getFullYear() + 1) {
      setData(null);
      setLoading(false);
      toast.error(t("errorInvalidYear"));
      return () => controller.abort();
    }

    setLoading(true);
    setData(null);
    fetch(`/api/exhibitions/analytics?year=${parsedYear}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load exhibition analytics");
        }

        return response.json();
      })
      .then((payload) => {
        setData(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setData(null);
        toast.error(t("errorLoadingAnalytics"));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [year]);

  const statusBreakdown = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      { key: "submitted", label: t("statusSubmitted"), value: data.kpis.submitted, color: "bg-sky-500" },
      { key: "underReview", label: t("statusUnderReview"), value: data.kpis.underReview, color: "bg-amber-500" },
      { key: "approved", label: t("statusApproved"), value: data.kpis.approved, color: "bg-emerald-500" },
      { key: "completed", label: t("statusCompleted"), value: data.kpis.completed, color: "bg-teal-500" },
      { key: "rejected", label: t("statusRejected"), value: data.kpis.rejected, color: "bg-rose-500" },
    ];
  }, [data, t]);

  if (loading) {
    return (
      <div className="page-container">
        <DashboardPageHeader
          eyebrow={t("adminAnalyticsBadge")}
          title={t("pageTitle")}
          description={t("pageDescription")}
          metrics={[
            { label: t("requestsLabel"), value: <Skeleton className="h-7 w-12" />, icon: Target },
            { label: t("approvalRateLabel"), value: <Skeleton className="h-7 w-12" />, icon: Percent },
            { label: t("roiLabel"), value: <Skeleton className="h-7 w-12" />, icon: TrendingUp },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-[28px]" />
          <Skeleton className="h-72 rounded-[28px]" />
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-muted-foreground">{t("errorLoadingAnalytics")}</div>;
  }

  const { kpis, monthly, participation, topAgents } = data;
  const performance = data.performance ?? DEFAULT_PERFORMANCE;
  const totalParticipation = participation.reduce((sum, item) => sum + item.count, 0);
  const strongestMonth = monthly.length > 0 ? [...monthly].sort((left, right) => right.total - left.total)[0] : null;

  return (
    <div className="page-container">
      <DashboardPageHeader
        eyebrow={`${t("adminAnalyticsBadge")} · ${t("yearBadge", { year: data.year })}`}
        title={t("pageTitle")}
        description={t("pageDescription")}
        summary={{
          label: t("approvedBudgetLabel"),
          value: formatCurrency(kpis.totalApprovedBudget, currencyCode),
          note: t("actualSpendLabel", { amount: formatCurrency(kpis.totalActualSpend, currencyCode) }),
        }}
        actions={(
          <div className="min-w-[10rem]">
            <SearchableSelect
              options={YEAR_OPTIONS}
              value={year}
              onValueChange={setYear}
              placeholder={t("selectYearPlaceholder")}
            />
          </div>
        )}
        metrics={[
          { label: t("requestsLabel"), value: kpis.totalRequests, note: strongestMonth ? t("requestsBusiestMonth", { month: strongestMonth.month }) : t("requestsNoData"), icon: Target, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50 dark:bg-sky-950/30" },
          { label: t("approvalRateLabel"), value: `${kpis.approvalRate}%`, note: t("approvalRateSub", { approved: kpis.approved, rejected: kpis.rejected }), icon: Percent, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: t("roiLabel"), value: `${performance.roi}%`, note: performance.eventsReported > 0 ? t("roiEventsReported", { eventsReported: performance.eventsReported }) : t("roiAwaitingReports"), icon: TrendingUp, iconClassName: "text-violet-600", iconSurfaceClassName: "bg-violet-50 dark:bg-violet-950/30" },
        ]}
      >
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MiniMetric label={t("leadsGeneratedLabel")} value={performance.totalLeads} />
          <MiniMetric label={t("employersEngagedLabel")} value={performance.totalEmployers} />
          <MiniMetric label={t("candidatesSourchedLabel")} value={performance.totalCandidates} />
          <MiniMetric label={t("hiresGeneratedLabel")} value={performance.totalHires} />
        </div>
      </DashboardPageHeader>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("totalRequestsLabel")}
          value={kpis.totalRequests}
          icon={<CalendarDays className="h-5 w-5" />}
          sub={t("totalRequestsSub", { submitted: kpis.submitted })}
        />
        <MetricCard
          label={t("avgBudgetLabel")}
          value={formatCurrency(kpis.avgBudget, currencyCode)}
          icon={<DollarSign className="h-5 w-5" />}
          sub={t("avgBudgetSub", { total: formatCurrency(kpis.totalEstimatedBudget, currencyCode) })}
        />
        <MetricCard
          label={t("budgetVarianceLabel")}
          value={formatCurrency(kpis.budgetVariance, currencyCode)}
          icon={<TrendingUp className="h-5 w-5" />}
          sub={kpis.budgetVariance >= 0 ? t("budgetVarianceUnderspend") : t("budgetVarianceOverspend")}
        />
        <MetricCard
          label={t("completionRateLabel")}
          value={`${kpis.totalRequests > 0 ? Math.round((kpis.completed / kpis.totalRequests) * 100) : 0}%`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          sub={t("completionRateSub", { completed: kpis.completed })}
        />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="workspace-panel-surface min-w-0 rounded-[28px] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("monthlyRequestFlowTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("monthlyRequestFlowDescription")}</p>
            </div>
            <Badge variant="outline">{t("monthlyRequestFlowBadge")}</Badge>
          </div>
          <div className="h-[22rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={monthly} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} className="text-xs" />
                <YAxis axisLine={false} tickLine={false} className="text-xs" />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                  contentStyle={{ borderRadius: "16px", borderColor: "rgba(148, 163, 184, 0.18)" }}
                />
                <Legend />
                <Bar dataKey="submitted" fill="#0ea5e9" name={t("barChartSubmitted")} radius={[8, 8, 0, 0]} />
                <Bar dataKey="approved" fill="#10b981" name={t("barChartApproved")} radius={[8, 8, 0, 0]} />
                <Bar dataKey="completed" fill="#14b8a6" name={t("barChartCompleted")} radius={[8, 8, 0, 0]} />
                <Bar dataKey="rejected" fill="#f43f5e" name={t("barChartRejected")} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("requestPipelineTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("requestPipelineDescription")}</p>
            </div>
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-4">
            {statusBreakdown.map((item) => (
              <div key={item.key} className="space-y-2 rounded-2xl border bg-muted/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <span className="text-sm font-semibold">{item.value}</span>
                </div>
                <Progress value={kpis.totalRequests > 0 ? (item.value / kpis.totalRequests) * 100 : 0} className="h-2.5" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="workspace-panel-surface min-w-0 rounded-[28px] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("participationMixTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("participationMixDescription")}</p>
            </div>
            <Target className="h-5 w-5 text-primary" />
          </div>
          {participation.length > 0 ? (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={participation.map((item) => ({ name: item.type.replace(/_/g, " "), value: item.count }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {participation.map((item, index) => (
                        <Cell key={item.type} fill={PARTICIPATION_COLORS[index % PARTICIPATION_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [Number(value ?? 0), t("participationTooltip")]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-3">
                {participation.map((item, index) => (
                  <div key={item.type} className="rounded-2xl border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: PARTICIPATION_COLORS[index % PARTICIPATION_COLORS.length] }}
                        />
                        <span className="font-medium capitalize">{item.type.replace(/_/g, " ")}</span>
                      </div>
                      <span className="text-sm font-semibold">{item.count}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={totalParticipation > 0 ? (item.count / totalParticipation) * 100 : 0} className="h-2.5 flex-1" />
                      <span className="w-12 text-right text-xs text-muted-foreground">
                        {totalParticipation > 0 ? Math.round((item.count / totalParticipation) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("participationNoData")}
            </div>
          )}
        </div>

        <div className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("topAgentsTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("topAgentsDescription")}</p>
            </div>
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableHeaderAgent")}</TableHead>
                <TableHead className="text-center">{t("tableHeaderRequests")}</TableHead>
                <TableHead className="text-center">{t("tableHeaderApproval")}</TableHead>
                <TableHead className="text-right">{t("tableHeaderBudget")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topAgents.map((agent) => (
                <TableRow key={agent.agentId} className="h-16">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {agent.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{agent.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{t("tableApprovedSub", { count: agent.approved })}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-center font-medium">{agent.total}</TableCell>
                  <TableCell className="whitespace-nowrap text-center">
                    <Badge variant="outline">{agent.approvalRate}%</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium">
                    {formatCurrency(agent.totalBudget, currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
              {topAgents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {t("tableNoActivity")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniSummaryCard
              label={t("revenueLabel")}
              value={formatCurrency(performance.totalRevenue, currencyCode)}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <MiniSummaryCard
              label={t("costLabel")}
              value={formatCurrency(performance.totalCost, currencyCode)}
              icon={<Percent className="h-4 w-4" />}
            />
            <MiniSummaryCard
              label={t("teamReachLabel")}
              value={performance.totalEmployers + performance.totalCandidates}
              icon={<Users className="h-4 w-4" />}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MiniSummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-lg font-semibold">{value}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
    </div>
  );
}
