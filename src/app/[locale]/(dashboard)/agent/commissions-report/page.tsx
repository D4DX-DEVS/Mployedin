"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  CircleDollarSign, Clock, CheckCircle2, Wallet,
  CalendarDays, RotateCcw, TrendingUp,
} from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonthlyItem {
  month: number;
  total: number;
  pending: number;
  approved: number;
  paid: number;
}

interface TypeBreakdown {
  type: string;
  amount: number;
  count: number;
  percent: number;
}

interface YearToDate {
  totalAmount: number;
  totalCount: number;
  pendingAmount: number;
  approvedAmount: number;
  paidAmount: number;
  pendingCount: number;
  approvedCount: number;
  paidCount: number;
  estimatedNextPayment: number;
  currency: string;
}

interface ReportData {
  year: number;
  yearToDate: YearToDate;
  monthlyBreakdown: MonthlyItem[];
  typeBreakdown: TypeBreakdown[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TYPE_COLORS: Record<string, string> = {
  placement: "#6366f1",
  override: "#f59e0b",
  bonus: "#10b981",
};

function fmt(value: number, currency = "AED"): string {
  if (value >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${formatCount(value)}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentCommissionsReportPage() {
  const t = useTranslations("agentCommissionsReport");
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/commissions-report?year=${yearFilter}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        toast.error(t("loadReportError"));
      }
    } catch {
      toast.error(t("loadReportError"));
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const chartData = data?.monthlyBreakdown.map((m) => ({
    name: MONTHS_SHORT[m.month - 1],
    Pending: m.pending,
    Approved: m.approved,
    Paid: m.paid,
  })) ?? [];

  const pieData = data?.typeBreakdown.map((t) => ({
    name: t.type.charAt(0).toUpperCase() + t.type.slice(1),
    value: t.amount,
    color: TYPE_COLORS[t.type] ?? "#94a3b8",
  })) ?? [];

  const ytd = data?.yearToDate;
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle", { year: yearFilter })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(yearFilter)} onValueChange={(v) => setYearFilter(Number(v))}>
            <SelectTrigger className="w-28">
              <CalendarDays className="mr-1.5 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchReport} disabled={loading}>
            <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Single-Row Metrics Strip ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-lg border bg-card card-pad">
        {[
          {
            label: t("totalEarned", { year: yearFilter }),
            value: ytd ? fmt(ytd.totalAmount, ytd.currency) : "—",
            icon: CircleDollarSign,
            color: "text-indigo-600 bg-indigo-50",
          },
          {
            label: t("statusPending"),
            value: ytd ? fmt(ytd.pendingAmount, ytd.currency) : "—",
            icon: Clock,
            color: "text-amber-600 bg-amber-50",
          },
          {
            label: t("statusApproved"),
            value: ytd ? fmt(ytd.approvedAmount, ytd.currency) : "—",
            icon: CheckCircle2,
            color: "text-blue-600 bg-blue-50",
          },
          {
            label: t("statusPaidOut"),
            value: ytd ? fmt(ytd.paidAmount, ytd.currency) : "—",
            icon: Wallet,
            color: "text-emerald-600 bg-emerald-50",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 w-full">
              <span className={`rounded-full p-1 ${color} flex-shrink-0`}>
                <Icon className="h-3 w-3" />
              </span>
              <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
            </div>
            <p className="text-lg font-bold">
              {loading ? <span className="h-5 w-20 animate-pulse rounded bg-muted inline-block" /> : value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Est. Next Payment Caption ── */}
      <div className="text-xs text-muted-foreground px-1">
        <span className="font-medium">{t("estNextPayment")}:</span> {ytd ? fmt(ytd.estimatedNextPayment, ytd.currency) : "—"} {t("basedOnApproved")}
      </div>

      {/* ── Monthly Chart + Type Breakdown ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border bg-card card-pad">
          <h2 className="heading-label mb-3 font-semibold">{t("monthlyBreakdown")}</h2>
          {chartData.length > 0 && chartData.some((m) => m.Pending > 0 || m.Approved > 0 || m.Paid > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
                <ReTooltip formatter={(v) => fmt(v as number)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Pending" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Approved" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Paid" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">{t("noData")}</div>
          )}
        </div>

        <div className="rounded-lg border bg-card card-pad">
          <h2 className="heading-label mb-3 font-semibold">{t("byType")}</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <ReTooltip formatter={(v) => fmt(v as number)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">{t("noData")}</div>
          )}
          <div className="mt-2 space-y-1.5">
            {data?.typeBreakdown.map((t) => (
              <div key={t.type} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 capitalize">
                  <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[t.type] ?? "#94a3b8" }} />
                  {t.type}
                </span>
                <span className="font-medium">{t.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
