"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import {
  Activity,
  Percent,
  Target,
  UsersRound,
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
import { formatCurrency } from "@/lib/currency";
import { TeamPerformanceReport, formatMoneyByCurrency, type TeamRow } from "./_components/TeamPerformanceReport";

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

/** From the completion reports; money per currency. */
interface Outcomes {
  completed: number;
  eventsReported: number;
  completedWithoutReport: number;
  expectedLeads: number;
  leadsCollected: number;
  actualSpend: Record<string, number>;
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

interface AnalyticsData {
  year: number;
  kpis: KPIs;
  outcomes?: Outcomes;
  monthly: MonthlyPoint[];
  participation: ParticipationItem[];
  teams?: TeamRow[];
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

const EMPTY_OUTCOMES: Outcomes = {
  completed: 0,
  eventsReported: 0,
  completedWithoutReport: 0,
  expectedLeads: 0,
  leadsCollected: 0,
  actualSpend: {},
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
          compactOnMobile
          title={t("pageTitle")}
          description={t("pageDescription")}
          metrics={[
            { label: t("requestsLabel"), value: <Skeleton className="h-7 w-12" />, icon: Target },
            { label: t("approvalRateLabel"), value: <Skeleton className="h-7 w-12" />, icon: Percent },
            { label: t("leadsCollectedLabel"), value: <Skeleton className="h-7 w-12" />, icon: UsersRound },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-muted-foreground">{t("errorLoadingAnalytics")}</div>;
  }

  const { kpis, monthly, participation } = data;
  const outcomes = data.outcomes ?? EMPTY_OUTCOMES;
  const totalParticipation = participation.reduce((sum, item) => sum + item.count, 0);
  const strongestMonth = monthly.length > 0 ? [...monthly].sort((left, right) => right.total - left.total)[0] : null;

  return (
    <div className="page-container">
      <DashboardPageHeader
        compact
        compactOnMobile
        eyebrow={t("yearBadge", { year: data.year })}
        title={t("pageTitle")}
        description={t("pageDescription")}
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
          { label: t("requestsLabel"), value: kpis.totalRequests, note: strongestMonth ? t("requestsBusiestMonth", { month: strongestMonth.month }) : t("requestsNoData"), icon: Target, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("approvalRateLabel"), value: `${kpis.approvalRate}%`, note: t("approvalRateSub", { approved: kpis.approved, rejected: kpis.rejected }), icon: Percent, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50" },
          { label: t("leadsCollectedLabel"), value: outcomes.leadsCollected, note: t("leadsCollectedNote", { count: outcomes.eventsReported }), icon: UsersRound, iconClassName: "text-violet-600", iconSurfaceClassName: "bg-violet-50" },
        ]}
      />

      {/* One panel instead of four floating metric cards plus four tiles inside
          the hero. The old "Total requests" card printed the hero's own
          Requests figure a second time, and its "N newly submitted" note is the
          Submitted row of the pipeline panel further down — three prints of two
          numbers. Budget and outcome figures are grouped and labelled here so
          the hero carries only the headline trio. */}
      <section className="workspace-panel-surface rounded-2xl panel-body panel-stack">
        <div className="panel-stack">
          <p className="heading-label">{t("budgetDeliveryGroupLabel")}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniMetric
              label={t("approvedBudgetLabel")}
              value={formatCurrency(kpis.totalApprovedBudget, currencyCode)}
              sub={t("actualSpendLabel", { amount: formatCurrency(kpis.totalActualSpend, currencyCode) })}
            />
            <MiniMetric
              label={t("avgBudgetLabel")}
              value={formatCurrency(kpis.avgBudget, currencyCode)}
              sub={t("avgBudgetSub", { total: formatCurrency(kpis.totalEstimatedBudget, currencyCode) })}
            />
            <MiniMetric
              label={t("budgetVarianceLabel")}
              value={formatCurrency(kpis.budgetVariance, currencyCode)}
              sub={kpis.budgetVariance >= 0 ? t("budgetVarianceUnderspend") : t("budgetVarianceOverspend")}
            />
            <MiniMetric
              label={t("completionRateLabel")}
              value={`${kpis.totalRequests > 0 ? Math.round((kpis.completed / kpis.totalRequests) * 100) : 0}%`}
              sub={t("completionRateSub", { completed: kpis.completed })}
            />
          </div>
        </div>

        <div className="panel-stack">
          <p className="heading-label">{t("outcomesGroupLabel")}</p>
          {/* From the completion reports. The old tiles read a performance record
              no screen ever writes, so leads, hires, revenue and ROI were always 0. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniMetric
              label={t("leadsCollectedLabel")}
              value={outcomes.leadsCollected}
              sub={t("leadsExpectedSub", { expected: outcomes.expectedLeads })}
            />
            <MiniMetric
              label={t("eventsReportedLabel")}
              value={outcomes.eventsReported}
              sub={outcomes.completedWithoutReport > 0
                ? t("eventsMissingReportSub", { count: outcomes.completedWithoutReport })
                : t("eventsReportedSub", { completed: outcomes.completed })}
            />
            <MiniMetric label={t("actualSpendTileLabel")} value={formatMoneyByCurrency(outcomes.actualSpend)} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="workspace-panel-surface min-w-0 rounded-2xl panel-body">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("monthlyRequestFlowTitle")}</h2>
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

        <div className="workspace-panel-surface rounded-2xl panel-body">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("requestPipelineTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("requestPipelineDescription")}</p>
            </div>
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div className="divide-y divide-border/60">
            {statusBreakdown.map((item) => (
              <div key={item.key} className="space-y-2 py-3 first:pt-0 last:pb-0">
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

      {data.teams && <TeamPerformanceReport teams={data.teams} />}

      <section>
        <div className="workspace-panel-surface min-w-0 rounded-2xl panel-body">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("participationMixTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("participationMixDescription")}</p>
            </div>
            <Target className="h-5 w-5 text-primary" />
          </div>
          {participation.length > 0 ? (
            <div className="grid items-center gap-4 sm:grid-cols-[12rem_1fr]">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={participation.map((item) => ({ name: item.type.replace(/_/g, " "), value: item.count }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={80}
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
              <div className="min-w-0 divide-y divide-border/60">
                {participation.map((item, index) => (
                  <div key={item.type} className="py-2.5 first:pt-0 last:pb-0">
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
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("participationNoData")}
            </div>
          )}
        </div>

      </section>
    </div>
  );
}


function MiniMetric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 chip-pad">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
