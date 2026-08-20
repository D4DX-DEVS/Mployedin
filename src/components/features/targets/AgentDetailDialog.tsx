"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  MapPin,
  Calendar,
  AlertTriangle,
  Target,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  Legend,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentProfile {
  _id: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  region?: string;
  territory?: string;
  currency: string;
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
  riskScore: "high" | "medium" | "low";
  incentiveTier: "none" | "bronze" | "silver" | "gold" | "platinum";
  status: string;
  lastActivityAt?: string;
  createdAt?: string;
  updatedAt?: string;
  monthlyAchievements: {
    month: number;
    employerTarget: number;
    employeeTarget: number;
    financeTarget: number;
    employerAchieved: number;
    employeeAchieved: number;
    financeAchieved: number;
    overallProgress: number;
  }[];
}

interface AgentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentProfile | null;
  year: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getRiskColor(risk: string) {
  switch (risk) {
    case "high": return "bg-red-100 text-red-700 border-red-200";
    case "medium": return "bg-amber-100 text-amber-700 border-amber-200";
    case "low": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function getTierColor(tier: string) {
  switch (tier) {
    case "platinum": return "bg-violet-100 text-violet-700 border-violet-200";
    case "gold": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "silver": return "bg-slate-100 text-slate-700 border-slate-200";
    case "bronze": return "bg-orange-100 text-orange-700 border-orange-200";
    default: return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

function getProgressColor(progress: number): string {
  if (progress >= 75) return "#10b981";
  if (progress >= 40) return "#f59e0b";
  return "#ef4444";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentDetailDialog({ open, onOpenChange, agent, year }: AgentDetailDialogProps) {
  const t = useTranslations("agentDetailDialog");
  if (!agent) return null;

  const overallColor = getProgressColor(agent.overallProgress);

  /* Radial chart data for overall progress */
  const radialData = [
    {
      name: "Progress",
      value: Math.min(agent.overallProgress, 100),
      fill: overallColor,
    },
  ];

  /* Target summary cards */
  const targetCards = [
    {
      label: "Employers",
      icon: <Building2 className="h-4 w-4" />,
      achieved: agent.employerAchieved,
      target: agent.employerTarget,
      progress: agent.employerProgress,
      color: "#3b82f6",
    },
    {
      label: "Employees",
      icon: <Users className="h-4 w-4" />,
      achieved: agent.employeeAchieved,
      target: agent.employeeTarget,
      progress: agent.employeeProgress,
      color: "#8b5cf6",
    },
    {
      label: "Revenue",
      icon: <DollarSign className="h-4 w-4" />,
      achieved: agent.financeAchieved,
      target: agent.financeTarget,
      progress: agent.financeProgress,
      color: "#10b981",
      isCurrency: true,
    },
  ];

  /* Monthly chart data */
  const monthlyChartData = (agent.monthlyAchievements ?? []).map((m) => ({
    month: MONTHS_SHORT[m.month - 1] ?? `M${m.month}`,
    employers: m.employerAchieved,
    employerTarget: m.employerTarget,
    employees: m.employeeAchieved,
    employeeTarget: m.employeeTarget,
    revenue: m.financeAchieved,
    revenueTarget: m.financeTarget,
  }));

  const lastActivity = agent.lastActivityAt
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(agent.lastActivityAt))
    : "No activity";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0" hideClose>
        {/* Header */}
        <DialogHeader className="flex-shrink-0 panel-head">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-sky-600" />
                {agent.assigneeName}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                {agent.assigneeEmail}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t("close")}</span>
            </button>
          </div>
          {/* Meta + Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={getRiskColor(agent.riskScore)}>
              {agent.riskScore === "high" && <AlertTriangle className="mr-1 h-3 w-3" />}
              {agent.riskScore.charAt(0).toUpperCase() + agent.riskScore.slice(1)} Risk
            </Badge>
            {agent.incentiveTier !== "none" && (
              <Badge variant="outline" className={getTierColor(agent.incentiveTier)}>
                {agent.incentiveTier.charAt(0).toUpperCase() + agent.incentiveTier.slice(1)}
              </Badge>
            )}
            <span className="mx-1 text-border">|</span>
            {agent.territory && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {agent.territory}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {year}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              {lastActivity}
            </span>
          </div>
        </DialogHeader>

        {/* Body - hidden scrollbar */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-6">

            {/* Overall Progress Ring + Target Cards */}
            <div className="grid grid-cols-[160px_1fr] gap-4">
              {/* Radial Progress */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-muted/20 p-4">
                <ResponsiveContainer width={120} height={120}>
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="70%"
                    outerRadius="100%"
                    barSize={12}
                    data={radialData}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar
                      background={{ fill: "hsl(var(--muted))" }}
                      dataKey="value"
                      cornerRadius={6}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <p className="mt-1 text-2xl font-bold" style={{ color: overallColor }}>
                  {agent.overallProgress}%
                </p>
                <p className="text-[11px] text-muted-foreground">{t("overallProgress")}</p>
              </div>

              {/* Target Cards */}
              <div className="grid grid-cols-3 gap-3">
                {targetCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-xl border border-border/60 bg-card p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {card.icon}
                      <span className="text-xs font-semibold uppercase tracking-wide">{card.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold text-foreground tabular-nums">
                        {card.isCurrency
                          ? `${agent.currency} ${card.achieved.toLocaleString()}`
                          : card.achieved.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        / {card.isCurrency
                          ? `${agent.currency} ${card.target.toLocaleString()}`
                          : card.target.toLocaleString()}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(card.progress, 100)}%`,
                          backgroundColor: card.color,
                        }}
                      />
                    </div>
                    <p className="text-right text-xs font-semibold" style={{ color: getProgressColor(card.progress) }}>
                      {card.progress}%
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Performance Chart */}
            {monthlyChartData.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-sky-600" />
                  {t("monthlyPerformance")} — {year}
                </h3>

                {/* Employers & Employees Bar Chart */}
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">{t("employersEmployees")}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyChartData} barGap={2} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="employerTarget" name="Employer Target" fill="#93c5fd" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="employers" name="Employers Achieved" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="employeeTarget" name="Employee Target" fill="#c4b5fd" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="employees" name="Employees Achieved" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Revenue Bar Chart */}
                <div className="rounded-xl border border-border/60 bg-card p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">{t("revenue")} ({agent.currency})</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthlyChartData} barGap={2} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value) => [`${agent.currency} ${Number(value).toLocaleString()}`, undefined]}
                      />
                      <Bar dataKey="revenueTarget" name="Revenue Target" fill="#86efac" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="revenue" name="Revenue Achieved" fill="#10b981" radius={[2, 2, 0, 0]} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Monthly Table Fallback (when no monthly data) */}
            {monthlyChartData.length === 0 && (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-8 text-center">
                <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("noMonthlyData")}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
