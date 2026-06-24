"use client";

import {
  DollarSign, CheckCircle, Users, TrendingDown,
} from "lucide-react";
import type { DashboardOverview, KpiComparisons, RevenueTrendPoint } from "./useSubscriptionDashboard";

interface KpiCardsRowProps {
  overview: DashboardOverview;
  comparisons: KpiComparisons;
  revenueTrend?: RevenueTrendPoint[];
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0 }).format(n);
}

/* ── Mini Sparkline SVG ─────────────────────────────────────────────────── */
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 32;
  const w = 100;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 mt-2" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={`0,${h} ${points} ${w},${h}`}
        fill={color}
        opacity="0.08"
      />
    </svg>
  );
}

/* ── Employer/JobSeeker Mini Bar ────────────────────────────────────────── */
function SplitBar({ employer, jobSeeker }: { employer: number; jobSeeker: number }) {
  const total = employer + jobSeeker || 1;
  const empPct = (employer / total) * 100;
  return (
    <div className="mt-3">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/50">
        <div className="h-full bg-primary rounded-l-full" style={{ width: `${empPct}%` }} />
        <div className="h-full bg-indigo-400 rounded-r-full" style={{ width: `${100 - empPct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          Employers: {employer}
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
          Job Seekers: {jobSeeker}
        </span>
      </div>
    </div>
  );
}

export function KpiCardsRow({ overview, comparisons, revenueTrend }: KpiCardsRowProps) {
  const sparkData = revenueTrend?.map((p) => p.mrr) ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* ── Monthly Recurring Revenue ── */}
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-900/10 dark:to-card p-5 transition-all hover:shadow-md">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Monthly Recurring Revenue
          </span>
          <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
        </div>
        <p className="text-3xl font-bold">{formatCurrency(overview.mrr)} <span className="text-base font-medium text-muted-foreground">AED</span></p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${comparisons.mrrChange >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
            {comparisons.mrrChange >= 0 ? "↑" : "↓"} {Math.abs(comparisons.mrrChange)}%
          </span>
          <span className="text-xs text-muted-foreground">vs last month · {formatCurrency(overview.arr)} AED ARR</span>
        </div>
        <MiniSparkline data={sparkData} color="#10b981" />
        <SplitBar employer={overview.employerActive} jobSeeker={overview.jobSeekerActive} />
      </div>

      {/* ── Active Subscriptions ── */}
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-900/10 dark:to-card p-5 transition-all hover:shadow-md">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Active Subscriptions
          </span>
          <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
        </div>
        <p className="text-3xl font-bold">{formatNumber(overview.active)}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${comparisons.activeChange >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
            {comparisons.activeChange >= 0 ? "↑" : "↓"} {Math.abs(comparisons.activeChange)}%
          </span>
        </div>
        <SplitBar employer={overview.employerActive} jobSeeker={overview.jobSeekerActive} />
      </div>

      {/* ── Total Subscriptions ── */}
      <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-50/60 to-white dark:from-sky-900/10 dark:to-card p-5 transition-all hover:shadow-md">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Total Subscriptions
          </span>
          <div className="h-8 w-8 rounded-full bg-sky-500/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-sky-500" />
          </div>
        </div>
        <p className="text-3xl font-bold">{formatNumber(overview.total)}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${comparisons.totalChange >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
            {comparisons.totalChange >= 0 ? "↑" : "↓"} {Math.abs(comparisons.totalChange)}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          All time · {overview.cancelledThisMonth} cancelled this month
        </p>
      </div>

      {/* ── Churn Rate ── */}
      <div className="rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-50/60 to-white dark:from-rose-900/10 dark:to-card p-5 transition-all hover:shadow-md">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Churn Rate
          </span>
          <div className="h-8 w-8 rounded-full bg-rose-500/10 flex items-center justify-center">
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </div>
        </div>
        <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{overview.churnRate}%</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${comparisons.churnChange <= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
            {comparisons.churnChange <= 0 ? "↓" : "↑"} {Math.abs(comparisons.churnChange)}%
          </span>
          <span className="text-xs text-muted-foreground">vs last month</span>
        </div>
        <p className="text-xs text-rose-500 mt-3 font-medium">
          {overview.expiringSoon} subscriptions expiring soon
        </p>
      </div>
    </div>
  );
}
