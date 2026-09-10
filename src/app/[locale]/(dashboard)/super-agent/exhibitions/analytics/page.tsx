"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
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
  /** Cleared approval, completed included — the approval-rate numerator. */
  approved: number;
  /** Approved but not yet completed — the pipeline row, so completed is not counted twice. */
  approvedInProgress: number;
  rejected: number;
  completed: number;
  underReview: number;
  /** Draft / revision requested / archived, so the pipeline buckets sum to totalRequests. */
  other: number;
  approvalRate: number;
  /** approved + rejected — what approvalRate is a percentage of. */
  decided: number;
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
  rejected: number;
  /** approved + rejected — the denominator behind approvalRate, matching the headline card. */
  decided: number;
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

export default function SuperAgentExhibitionAnalyticsPage() {
  const t = useTranslations("superAgentExhibitionsAnalytics");
  const tc = useTranslations("common");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [currencyCode, setCurrencyCode] = useState("AED");
  // Starts false so the server render and the first client render agree; the
  // effect corrects it after mount and on resize.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    fetch("/api/super-agent/profile")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.profile?.currencyCode) {
          setCurrencyCode(payload.profile.currencyCode);
        }
      })
      .catch(() => {});
  }, []);

  const fetchAnalyticsData = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/exhibitions/analytics?year=${year}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload) {
          setData(payload);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => { fetchAnalyticsData(); }, [fetchAnalyticsData]);

  const statusBreakdown = useMemo(() => {
    if (!data) {
      return [];
    }

    // These bars divide by totalRequests, so they have to partition it. The
    // approved row uses approvedInProgress (completed excluded) and the "other"
    // row carries draft / revision requested / archived — without it the bars
    // summed to a fraction of the total printed above them.
    return [
      { key: "submitted", label: t("statusSubmitted"), value: data.kpis.submitted, color: "bg-sky-500" },
      { key: "underReview", label: t("statusUnderReview"), value: data.kpis.underReview, color: "bg-amber-500" },
      { key: "approved", label: t("statusApproved"), value: data.kpis.approvedInProgress, color: "bg-emerald-500" },
      { key: "completed", label: t("statusCompleted"), value: data.kpis.completed, color: "bg-teal-500" },
      { key: "rejected", label: t("statusRejected"), value: data.kpis.rejected, color: "bg-rose-500" },
      { key: "other", label: t("statusOther"), value: data.kpis.other, color: "bg-slate-400" },
    ];
  }, [data, t]);

  if (loading) {
    return (
      <div className="page-container">
        <DashboardPageHeader icon={BarChart3} eyebrow={t("superAgentAnalytics")} title={t("heroTitle")} description={t("heroDescription")} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card space-y-2 panel-body">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-container">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-8 text-center">
          <p className="text-sm text-destructive">{t("failedToLoadAnalytics")}</p>
          <button
            type="button"
            onClick={() => fetchAnalyticsData()}
            className="shrink-0 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-all"
          >
            {tc("tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  const { kpis, monthly, participation, performance = DEFAULT_PERFORMANCE, topAgents } = data;
  // Style selections, not requests: participation is a multi-select, so one
  // request can appear in several slices and the total here is deliberately
  // unrelated to kpis.totalRequests. Requests that picked no style arrive as
  // the "unspecified" bucket rather than being dropped.
  const totalParticipation = participation.reduce((sum, item) => sum + item.count, 0);
  const participationLabel = (type: string) =>
    type === "unspecified" ? t("participationUnspecified") : type.replace(/_/g, " ");
  const strongestMonth = [...monthly].sort((left, right) => right.total - left.total)[0];

  // Show last 6 months on mobile, all 12 on desktop
  const displayedMonthly = isMobile ? monthly.slice(-6) : monthly;
  // allowDecimals={false} alone made recharts widen the domain to 0-4 so it
  // could still draw its default five integer ticks against a max of 1. Tick
  // count follows the data instead, so the axis stops where the bars do.
  const monthlyPeak = displayedMonthly.reduce(
    (peak, point) => Math.max(peak, point.submitted, point.approved, point.completed, point.rejected),
    0
  );

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={BarChart3}
        eyebrow={t("superAgentAnalytics")}
        title={t("heroTitle")}
        description={t("heroDescription")}
        summary={{ label: t("approvedBudgetLabel"), value: formatCurrency(kpis.totalApprovedBudget, currencyCode), note: `${t("actualSpendLabel")} ${formatCurrency(kpis.totalActualSpend, currencyCode)}` }}
        actions={
              <div className="min-w-[10rem]">
                <SearchableSelect
                  options={YEAR_OPTIONS}
                  value={year}
                  onValueChange={setYear}
                  placeholder={t("selectYearPlaceholder")}
                />
              </div>
        }
        /* One home per metric. These used to be repeated immediately below in a
           second row of cards — "Requests" and "Total Requests" were the same
           number twice. Budget variance went with them: it is approved minus
           actual spend, and the summary above already shows both halves. */
        metrics={[
          { label: t("requestsLabel"), value: kpis.totalRequests, note: strongestMonth ? t("busiestMonthSub", { month: strongestMonth.month }) : t("noMonthlyData"), icon: CalendarDays },
          { label: t("approvalRateLabel"), value: kpis.decided > 0 ? `${kpis.approvalRate}%` : "—", note: t("approvalRateSub", { approved: kpis.approved, rejected: kpis.rejected }), icon: Percent },
          { label: t("avgRequestBudgetLabel"), value: formatCurrency(kpis.avgBudget, currencyCode), note: t("estimatedTotalSub", { total: formatCurrency(kpis.totalEstimatedBudget, currencyCode) }), icon: DollarSign },
          { label: t("completionRateLabel"), value: `${kpis.totalRequests > 0 ? Math.round((kpis.completed / kpis.totalRequests) * 100) : 0}%`, note: t("completedExhibitionsSub", { count: kpis.completed }), icon: CheckCircle2 },
        ]}
      />

      {/* No items-start: it let each panel keep its natural height, so the 457px
         chart sat beside a 637px pipeline with 180px of dead space under it.
         Default stretch + flex-1 on the plot area fills the taller column. */}
      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col rounded-3xl border bg-card shadow-sm card-pad">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("monthlyRequestFlowTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("monthlyRequestFlowDescription")}</p>
            </div>
            <Badge variant="outline">{t("monthsBadge")}</Badge>
          </div>
          <div className="min-h-[18rem] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayedMonthly} margin={{ top: 8, right: 40, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} className="text-xs" />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tickCount={Math.min(5, Math.max(2, monthlyPeak + 1))} className="text-xs" />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                  contentStyle={{ borderRadius: "16px", borderColor: "rgba(148, 163, 184, 0.18)" }}
                />
                <Legend />
                <Bar dataKey="submitted" fill="#0ea5e9" name={t("submittedBarLabel")} radius={[8, 8, 0, 0]} maxBarSize={14} />
                <Bar dataKey="approved" fill="#10b981" name={t("approvedBarLabel")} radius={[8, 8, 0, 0]} maxBarSize={14} />
                <Bar dataKey="completed" fill="#14b8a6" name={t("completedBarLabel")} radius={[8, 8, 0, 0]} maxBarSize={14} />
                <Bar dataKey="rejected" fill="#f43f5e" name={t("rejectedBarLabel")} radius={[8, 8, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col rounded-3xl border bg-card shadow-sm card-pad">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="heading-section font-semibold tracking-tight">{t("requestPipelineTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("requestPipelineDescription")}</p>
            </div>
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-1 flex-col justify-between gap-4">
            {statusBreakdown.map((item) => (
              <div key={item.key} className="space-y-2">
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

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card shadow-sm card-pad">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="heading-section font-semibold tracking-tight">{t("participationMixTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("participationMixDescription")}</p>
            </div>
            <Target className="h-5 w-5 shrink-0 text-primary" />
          </div>
          {participation.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={participation.map((item) => ({ name: participationLabel(item.type), value: item.count }))}
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
                    <Tooltip formatter={(value) => [Number(value ?? 0), t("tooltipSelections")]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {participation.map((item, index) => (
                  <div key={item.type}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: PARTICIPATION_COLORS[index % PARTICIPATION_COLORS.length] }}
                        />
                        <span className="font-medium capitalize">{participationLabel(item.type)}</span>
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
              {t("noParticipationData")}
            </div>
          )}
        </div>

        <div className="rounded-3xl border bg-card shadow-sm card-pad">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="heading-section font-semibold tracking-tight">{t("topAgentsTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("topAgentsDescription")}</p>
            </div>
            <Trophy className="h-5 w-5 shrink-0 text-primary" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("agentColumn")}</TableHead>
                <TableHead className="text-center">{t("requestsColumn")}</TableHead>
                <TableHead className="text-center">{t("approvalColumn")}</TableHead>
                <TableHead className="text-right">{t("budgetColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topAgents.map((agent) => (
                <TableRow key={agent.agentId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {agent.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{t("agentApprovedOfDecided", { approved: agent.approved, decided: agent.decided })}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">{agent.total}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" title={t("approvalRateExplainer")}>
                      {agent.decided > 0 ? `${agent.approvalRate}%` : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(agent.totalBudget, currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
              {topAgents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {t("noExhibitionActivity")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ROI still sits with revenue and cost because it is computed from them,
          and all four are outcomes rather than request process. They used to be
          a four-up crammed into the 601px agents column — 133px per tile, with
          "Team reach" wrapping — while 430px of dead space sat directly below
          that panel. Full width, own section, tiles get room. */}
      <section className="rounded-3xl border bg-card shadow-sm card-pad">
        <div className="mb-4">
          <h2 className="heading-section font-semibold tracking-tight">{t("outcomesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("outcomesDescription")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            label={t("roiLabel")}
            value={`${performance.roi}%`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <MiniSummaryCard
            label={t("teamReachLabel")}
            value={performance.totalEmployers + performance.totalCandidates}
            icon={<Users className="h-4 w-4" />}
          />
        </div>
      </section>
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
    <div className="rounded-2xl border bg-muted/20 card-pad">
      {/* The grid already makes these four tiles equal height, but a label that
          wraps to two lines ("Team reach") pushed its value below the other
          three. Pin the value to the bottom so the row of numbers lines up
          whatever the label length. */}
      <div className="flex h-full items-stretch justify-between gap-3">
        <div className="flex min-w-0 flex-col justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-lg font-semibold">{value}</p>
        </div>
        <div className="h-fit rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
    </div>
  );
}
