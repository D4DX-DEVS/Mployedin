"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CircleDollarSign,
  Receipt,
  Wallet,
  TrendingUp,
  MapPin,
  Calendar,
  AlertTriangle,
  FileText,
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
import { formatDate } from "@/lib/ui/intlFormat";
import type { EnrichedProfile } from "@/lib/targets/profileAchievementCalculator";
import { formatProfit, monthName } from "./profitFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A team row from the super agent's target API: an enriched profile with the agent's name. */
export type AgentDetailProfile = EnrichedProfile & {
  assigneeName: string;
  assigneeEmail: string;
  territory?: string;
  lastActivityAt?: string;
};

interface AgentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentDetailProfile | null;
  year: number;
  /** Opens this agent's full report. */
  onOpenReport?: (agent: AgentDetailProfile) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

export function AgentDetailDialog({ open, onOpenChange, agent, year, onOpenReport }: AgentDetailDialogProps) {
  const t = useTranslations("agentDetailDialog");
  const tc = useTranslations("targetComponents");
  const locale = useLocale();
  if (!agent) return null;

  const money = (value: number) => formatProfit(value, agent.currency, locale);
  const progressColor = getProgressColor(agent.profitProgress);
  const radialData = [{ name: t("progress"), value: Math.min(agent.profitProgress, 100), fill: progressColor }];

  const statCards = [
    { key: "profit", label: t("profitLabel"), icon: <CircleDollarSign className="h-4 w-4" />, value: agent.profitAchieved, target: agent.profitTarget },
    { key: "revenue", label: t("revenueLabel"), icon: <Wallet className="h-4 w-4" />, value: agent.drivers.revenue },
    { key: "commission", label: t("commissionLabel"), icon: <Receipt className="h-4 w-4" />, value: agent.drivers.commissionCost },
  ];

  const monthlyChartData = (agent.monthlyAchievements ?? []).map((m) => ({
    month: monthName(m.month, locale),
    target: m.profitTarget,
    profit: m.profitAchieved,
  }));

  const lastActivity = agent.lastActivityAt
    ? formatDate(agent.lastActivityAt, { month: "short", day: "numeric", year: "numeric" }, locale)
    : t("noActivity");

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
              {agent.riskScore === "high" && <AlertTriangle className="me-1 h-3 w-3" />}
              {t("riskBadge", { risk: tc(agent.riskScore) })}
            </Badge>
            {agent.incentiveTier !== "none" && (
              <Badge variant="outline" className={getTierColor(agent.incentiveTier)}>
                {tc(`tier_${agent.incentiveTier}`)}
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
            {/* Progress Ring + Stat Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
              <div className="card-pad flex flex-col items-center justify-center rounded-xl border border-border/60 bg-muted/20">
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
                    <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={6} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <p className="mt-1 text-2xl font-bold" style={{ color: progressColor }}>
                  {agent.profitProgress}%
                </p>
                <p className="text-[11px] text-muted-foreground">{t("progress")}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {statCards.map((card) => (
                  <div key={card.key} className="card-pad space-y-2 rounded-xl border border-border/60 bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {card.icon}
                      <span className="text-xs font-semibold uppercase tracking-wide">{card.label}</span>
                    </div>
                    <p className="text-xl font-bold tabular-nums text-foreground">{money(card.value)}</p>
                    {card.target !== undefined && (
                      <p className="text-xs text-muted-foreground">{t("ofTarget", { target: money(card.target) })}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly profit chart */}
            {monthlyChartData.length > 0 ? (
              <div className="space-y-3">
                <h3 className="heading-label flex items-center gap-2 font-semibold text-foreground">
                  <TrendingUp className="h-4 w-4 text-sky-600" />
                  {t("monthlyPerformance")} — {year}
                </h3>
                <div className="card-pad rounded-xl border border-border/60 bg-card">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">{t("profitChartTitle", { currency: agent.currency })}</p>
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
                        formatter={(value) => [money(Number(value)), undefined]}
                      />
                      <Bar dataKey="target" name={t("seriesTarget")} fill="#cbd5e1" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="profit" name={t("seriesProfit")} fill="#10b981" radius={[2, 2, 0, 0]} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-8 text-center">
                <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">{t("noMonthlyData")}</p>
              </div>
            )}

            {onOpenReport && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={() => onOpenReport(agent)}>
                  <FileText className="h-3.5 w-3.5" /> {t("openReport")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
