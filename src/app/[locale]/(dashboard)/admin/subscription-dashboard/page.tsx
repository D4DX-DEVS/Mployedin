"use client";

/**
 * Admin Subscription Dashboard
 *
 * Overview KPIs, tier distribution, expiring-soon list,
 * revenue summary, recent activity feed, and monthly trend.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Crown, Users, TrendingUp, TrendingDown, AlertTriangle, Clock,
  DollarSign, Activity, BarChart3, Briefcase, User, CheckCircle,
  XCircle, RotateCcw, ArrowUpRight, ArrowDownRight, CalendarClock,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────────────────────

interface OverviewStats {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  suspended: number;
}

interface TierItem {
  tier: number;
  planName: string;
  count: number;
}

interface ExpiringSoonItem {
  _id: string;
  userId: { _id: string; name: string; email: string } | null;
  planName: string;
  endDate: string;
  autoRenew: boolean;
  targetRole: string;
}

interface RevenueStats {
  totalRevenue: number;
  thisMonthRevenue: number;
  paidInvoiceCount: number;
}

interface ActivityItem {
  _id: string;
  userId: { _id: string; name: string; email: string } | null;
  action: string;
  toPlanName?: string;
  fromPlanName?: string;
  performedBy: { _id: string; name: string } | null;
  reason?: string;
  createdAt: string;
}

interface MonthlyTrendItem {
  year: number;
  month: number;
  newSubs: number;
}

interface DashboardData {
  overview: OverviewStats;
  byRole: Record<string, number>;
  tierDistribution: TierItem[];
  expiringSoon: ExpiringSoonItem[];
  revenue: RevenueStats;
  recentActivity: ActivityItem[];
  monthlyTrend: MonthlyTrendItem[];
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchStats(): Promise<DashboardData> {
  const res = await fetch("/api/admin/subscription-stats");
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0 }).format(n);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TIER_COLORS: Record<number, string> = {
  0: "bg-zinc-500",
  1: "bg-slate-400",
  2: "bg-amber-500",
  3: "bg-violet-500",
};

const TIER_NAMES: Record<number, string> = {
  0: "Free",
  1: "Silver",
  2: "Gold",
  3: "Platinum",
};

const ACTION_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  assigned: { icon: CheckCircle, color: "text-emerald-400", label: "Assigned" },
  upgraded: { icon: ArrowUpRight, color: "text-sky-400", label: "Upgraded" },
  downgraded: { icon: ArrowDownRight, color: "text-amber-400", label: "Downgraded" },
  renewed: { icon: RotateCcw, color: "text-emerald-400", label: "Renewed" },
  cancelled: { icon: XCircle, color: "text-red-400", label: "Cancelled" },
  expired: { icon: AlertTriangle, color: "text-amber-400", label: "Expired" },
  suspended: { icon: AlertTriangle, color: "text-orange-400", label: "Suspended" },
  reactivated: { icon: CheckCircle, color: "text-emerald-400", label: "Reactivated" },
};

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminSubscriptionDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "subscription-stats"],
    queryFn: fetchStats,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="page-container space-y-4">
        <PageHeader title="Subscription Dashboard" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-background/70" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-background/70" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-container space-y-4">
        <PageHeader title="Subscription Dashboard" />
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load dashboard data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Subscription Dashboard"
        description="Overview of all subscriptions, revenue, and activity"
      />

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Subscriptions"
          value={data.overview.total}
          icon={<Crown className="h-5 w-5 text-sky-500" />}
          accent="sky"
        />
        <KpiCard
          title="Active"
          value={data.overview.active}
          icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
          accent="emerald"
          subtitle={`${data.overview.expired} expired · ${data.overview.cancelled} cancelled`}
        />
        <KpiCard
          title="Revenue (All Time)"
          value={`${formatCurrency(data.revenue.totalRevenue)} AED`}
          icon={<DollarSign className="h-5 w-5 text-amber-500" />}
          accent="amber"
          subtitle={`${formatCurrency(data.revenue.thisMonthRevenue)} AED this month`}
        />
        <KpiCard
          title="Expiring Soon"
          value={data.expiringSoon.length}
          icon={<CalendarClock className="h-5 w-5 text-orange-500" />}
          accent="orange"
          subtitle="within 30 days"
        />
      </div>

      {/* ── Second Row: Role Split + Tier Distribution ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Role Split */}
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Users className="h-4 w-4" /> Active by Role
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <RoleCard
              label="Employers"
              count={data.byRole.employer ?? 0}
              icon={<Briefcase className="h-5 w-5 text-sky-500" />}
            />
            <RoleCard
              label="Job Seekers"
              count={data.byRole.job_seeker ?? 0}
              icon={<User className="h-5 w-5 text-violet-500" />}
            />
          </div>
        </section>

        {/* Tier Distribution */}
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Plan Distribution
          </h4>
          {data.tierDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active subscriptions yet</p>
          ) : (
            <div className="space-y-3">
              {data.tierDistribution.map((t) => {
                const maxCount = Math.max(...data.tierDistribution.map((x) => x.count), 1);
                const pct = (t.count / maxCount) * 100;
                return (
                  <div key={`${t.tier}-${t.planName}`}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{t.planName}</span>
                      <span className="text-muted-foreground">{t.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${TIER_COLORS[t.tier] ?? "bg-sky-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Monthly Trend ── */}
      {data.monthlyTrend.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> New Subscriptions Trend
          </h4>
          <div className="flex items-end gap-3 h-32">
            {data.monthlyTrend.map((m) => {
              const maxVal = Math.max(...data.monthlyTrend.map((x) => x.newSubs), 1);
              const heightPct = (m.newSubs / maxVal) * 100;
              return (
                <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium">{m.newSubs}</span>
                  <div className="w-full rounded-t-lg bg-sky-500/80 transition-all" style={{ height: `${Math.max(heightPct, 4)}%` }} />
                  <span className="text-[10px] text-muted-foreground">
                    {MONTH_NAMES[m.month - 1]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Third Row: Expiring Soon + Recent Activity ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expiring Soon */}
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Expiring Soon
          </h4>
          {data.expiringSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscriptions expiring in the next 30 days</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.expiringSoon.map((s) => {
                const days = daysUntil(s.endDate);
                const urgent = days <= 7;
                return (
                  <div
                    key={s._id}
                    className={`flex items-center justify-between rounded-xl border p-3 ${
                      urgent ? "border-red-500/30 bg-red-500/5" : "border-border/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {s.userId?.name ?? "Unknown User"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.userId?.email ?? "—"} · {s.planName}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <Badge className={`text-xs ${
                        urgent
                          ? "bg-red-500/10 text-red-400 border border-red-500/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}>
                        {days <= 0 ? "Today" : `${days}d`}
                      </Badge>
                      {s.autoRenew && (
                        <p className="text-[10px] text-emerald-400 mt-0.5">auto-renew</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Activity */}
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent Activity
          </h4>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscription activity yet</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.recentActivity.map((a) => {
                const cfg = ACTION_CONFIG[a.action] ?? ACTION_CONFIG.assigned;
                const Icon = cfg.icon;
                return (
                  <div key={a._id} className="flex items-start gap-3 rounded-xl border border-border/40 p-3">
                    <div className={`mt-0.5 ${cfg.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{a.userId?.name ?? "User"}</span>
                        {" "}
                        <span className="text-muted-foreground">{cfg.label.toLowerCase()}</span>
                        {a.toPlanName && (
                          <span className="text-muted-foreground"> → {a.toPlanName}</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{formatDate(a.createdAt)}</span>
                        {a.performedBy && (
                          <span>by {a.performedBy.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Invoice Summary ── */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Invoice Summary
        </h4>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border/40 p-4 text-center">
            <p className="text-2xl font-bold">{data.revenue.paidInvoiceCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Paid Invoices</p>
          </div>
          <div className="rounded-xl border border-border/40 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{formatCurrency(data.revenue.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Revenue (AED)</p>
          </div>
          <div className="rounded-xl border border-border/40 p-4 text-center">
            <p className="text-2xl font-bold text-sky-400">{formatCurrency(data.revenue.thisMonthRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">This Month (AED)</p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Sub-Components ───────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon,
  accent,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
  subtitle?: string;
}) {
  return (
    <div className={`rounded-2xl border border-${accent}-500/20 bg-gradient-to-br from-${accent}-500/5 to-transparent p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function RoleCard({
  label,
  count,
  icon,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold">{count}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
