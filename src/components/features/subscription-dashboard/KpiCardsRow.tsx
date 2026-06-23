"use client";

import {
  Crown, CheckCircle, DollarSign, TrendingDown,
  CalendarClock, XCircle, Briefcase, User,
} from "lucide-react";
import type { DashboardOverview, KpiComparisons } from "./useSubscriptionDashboard";

interface KpiCardsRowProps {
  overview: DashboardOverview;
  comparisons: KpiComparisons;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0 }).format(n);
}

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend: number;
  trendInverted?: boolean;
  icon: React.ReactNode;
  accentClass: string;
}

function KpiCard({ title, value, subtitle, trend, trendInverted, icon, accentClass }: KpiCardProps) {
  const isPositive = trendInverted ? trend < 0 : trend > 0;
  const isNeutral = trend === 0;
  const trendColor = isNeutral
    ? "text-muted-foreground"
    : isPositive
      ? "text-emerald-500"
      : "text-red-500";
  const arrow = trend > 0 ? "↑" : trend < 0 ? "↓" : "";

  return (
    <div className={`rounded-2xl border ${accentClass} bg-gradient-to-br p-5 transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-xs font-semibold ${trendColor}`}>
          {arrow} {Math.abs(trend)}%
        </span>
        <span className="text-xs text-muted-foreground">vs last month</span>
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}

export function KpiCardsRow({ overview, comparisons }: KpiCardsRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        title="Total Subscriptions"
        value={formatNumber(overview.total)}
        subtitle="All time"
        trend={comparisons.totalChange}
        icon={<Crown className="h-5 w-5 text-sky-500" />}
        accentClass="border-sky-500/20 from-sky-500/5 to-transparent"
      />
      <KpiCard
        title="Active Subscriptions"
        value={formatNumber(overview.active)}
        subtitle={`${formatNumber(overview.employerActive)} employers · ${formatNumber(overview.jobSeekerActive)} job seekers`}
        trend={comparisons.activeChange}
        icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
        accentClass="border-emerald-500/20 from-emerald-500/5 to-transparent"
      />
      <KpiCard
        title="MRR (Monthly)"
        value={`${formatCurrency(overview.mrr)} AED`}
        subtitle={`${formatCurrency(overview.arr)} AED ARR`}
        trend={comparisons.mrrChange}
        icon={<DollarSign className="h-5 w-5 text-amber-500" />}
        accentClass="border-amber-500/20 from-amber-500/5 to-transparent"
      />
      <KpiCard
        title="Churn Rate"
        value={`${overview.churnRate}%`}
        subtitle="This month"
        trend={comparisons.churnChange}
        trendInverted
        icon={<TrendingDown className="h-5 w-5 text-rose-500" />}
        accentClass="border-rose-500/20 from-rose-500/5 to-transparent"
      />
      <KpiCard
        title="Expiring Soon"
        value={formatNumber(overview.expiringSoon)}
        subtitle="Within 30 days"
        trend={0}
        icon={<CalendarClock className="h-5 w-5 text-orange-500" />}
        accentClass="border-orange-500/20 from-orange-500/5 to-transparent"
      />
      <KpiCard
        title="Cancelled This Month"
        value={formatNumber(overview.cancelledThisMonth)}
        trend={comparisons.cancelledChange}
        trendInverted
        icon={<XCircle className="h-5 w-5 text-red-500" />}
        accentClass="border-red-500/20 from-red-500/5 to-transparent"
      />
    </div>
  );
}
