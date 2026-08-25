"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import {
  Activity, Server, Database, Clock, Cpu, HardDrive, Wifi,
  AlertTriangle, CheckCircle2, XCircle, RefreshCcw, Users,
  Zap, Globe, TrendingUp, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, formatDate, formatTime } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HealthMetric {
  label: string;
  value: string | number;
  status: "healthy" | "warning" | "critical";
  icon: React.ReactNode;
  detail?: string;
}

interface SystemHealth {
  database: { status: string; latencyMs: number; connections: number };
  api: { status: string; avgResponseMs: number; errorRate: number; requestsToday: number };
  storage: { status: string; usedGb: number; totalGb: number };
  users: { online: number; totalActive: number; totalRegistered: number };
  jobs: { active: number; total: number; applicationsToday: number };
  cron: { lastRun: string; status: string; failedJobs: number };
  uptime: { percentage: number; lastDowntime?: string };
  memory: { usedMb: number; totalMb: number };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminSystemHealthPage() {
  const t = useTranslations("adminSystemHealth");
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  // Initialize to null so the server-rendered HTML and the first client render
  // match (avoids a hydration mismatch from time differing between SSR/client).
  // Populated on the first fetch, which runs in an effect after mount.
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/system-health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setLastRefresh(new Date());
      } else {
        toast.error(t("errorFetchHealth"));
      }
    } catch {
      toast.error(t("errorConnectHealth"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  /* Auto-refresh every 60 seconds */
  useEffect(() => {
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "critical": return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy": return "text-emerald-600 bg-emerald-50";
      case "warning": return "text-amber-600 bg-amber-50";
      case "critical": return "text-red-600 bg-red-50";
      default: return "text-muted-foreground bg-muted";
    }
  };

  const overallStatus = health
    ? (health.database.status === "healthy" && health.api.status === "healthy" ? "healthy" : "warning")
    : "unknown";

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={Activity}
        eyebrow={t("pageTitle")}
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={
          <>
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase ${getStatusColor(overallStatus)}`}>
              {getStatusIcon(overallStatus)}
              {overallStatus === "healthy" ? t("statusOperational") : overallStatus === "warning" ? t("statusDegraded") : t("statusChecking")}
            </div>
            <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
              <RefreshCcw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> {t("buttonRefresh")}
            </Button>
          </>
        }
        footer={
          <p className="text-xs text-muted-foreground">
            {t("lastUpdatedLabel")} {lastRefresh ? formatTime(lastRefresh) : "—"} · {t("autoRefreshLabel")}
          </p>
        }
      />

      {loading && !health ? (
        <section className="workspace-panel-surface rounded-3xl panel-body">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="workspace-glass-panel space-y-4 rounded-2xl panel-body">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : health ? (
        <>
          {/* Core Services */}
          <section className="workspace-panel-surface rounded-3xl panel-body">
            <h2 className="heading-label mb-4 font-semibold uppercase tracking-wider text-muted-foreground">{t("coreServicesHeading")}</h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {/* Database */}
              <div className="workspace-glass-panel rounded-2xl panel-body">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-indigo-500" />
                    <span className="font-medium text-foreground">{t("databaseLabel")}</span>
                  </div>
                  {getStatusIcon(health.database.status)}
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("latencyLabel")}</span>
                    <span className="font-medium">{health.database.latencyMs}ms</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("connectionsLabel")}</span>
                    <span className="font-medium">{health.database.connections}</span>
                  </div>
                </div>
              </div>

              {/* API */}
              <div className="workspace-glass-panel rounded-2xl panel-body">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-sky-500" />
                    <span className="font-medium text-foreground">{t("apiLabel")}</span>
                  </div>
                  {getStatusIcon(health.api.status)}
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("avgResponseLabel")}</span>
                    <span className="font-medium">{health.api.avgResponseMs}ms</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("errorRateLabel")}</span>
                    <span className={`font-medium ${health.api.errorRate > 5 ? "text-red-500" : ""}`}>{health.api.errorRate}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("requestsTodayLabel")}</span>
                    <span className="font-medium">{formatCount(health.api.requestsToday)}</span>
                  </div>
                </div>
              </div>

              {/* Storage */}
              <div className="workspace-glass-panel rounded-2xl panel-body">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5 text-violet-500" />
                    <span className="font-medium text-foreground">{t("storageLabel")}</span>
                  </div>
                  {getStatusIcon(health.storage.status)}
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("usedLabel")}</span>
                    <span className="font-medium">{health.storage.usedGb} GB / {health.storage.totalGb} GB</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (health.storage.usedGb / health.storage.totalGb) > 0.85 ? "bg-red-500" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(100, (health.storage.usedGb / health.storage.totalGb) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Platform Metrics */}
          <section className="workspace-panel-surface rounded-3xl panel-body">
            <h2 className="heading-label mb-4 font-semibold uppercase tracking-wider text-muted-foreground">{t("platformMetricsHeading")}</h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="workspace-glass-panel card-pad rounded-2xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("activeUsersLabel")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{formatCount(health.users.totalActive)}</p>
                <p className="text-xs text-muted-foreground">{health.users.online} {t("onlineNowLabel")}</p>
              </div>

              <div className="workspace-glass-panel card-pad rounded-2xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("activeJobsLabel")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{formatCount(health.jobs.active)}</p>
                <p className="text-xs text-muted-foreground">{health.jobs.applicationsToday} {t("applicationsTodayLabel")}</p>
              </div>

              <div className="workspace-glass-panel card-pad rounded-2xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("uptimeLabel")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold">{health.uptime.percentage}%</p>
                <p className="text-xs text-muted-foreground">
                  {health.uptime.lastDowntime ? `${t("lastIncidentLabel")} ${formatDate(new Date(health.uptime.lastDowntime))}` : t("noIncidentsLabel")}
                </p>
              </div>

              <div className="workspace-glass-panel card-pad rounded-2xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("cronJobsLabel")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold flex items-center gap-2">
                  {getStatusIcon(health.cron.failedJobs > 0 ? "warning" : "healthy")}
                  {health.cron.failedJobs === 0 ? t("cronStatusOk") : `${health.cron.failedJobs} ${t("cronStatusFailed")}`}
                </p>
                <p className="text-xs text-muted-foreground">{t("lastRunLabel")} {health.cron.lastRun ? formatTime(new Date(health.cron.lastRun)) : t("neverLabel")}</p>
              </div>
            </div>
          </section>

          {/* Memory */}
          <section className="workspace-panel-surface rounded-3xl panel-body">
            <h2 className="heading-label mb-4 font-semibold uppercase tracking-wider text-muted-foreground">{t("memoryHeading")}</h2>
            <div className="workspace-glass-panel rounded-2xl panel-body">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-amber-500" />
                  <span className="font-medium">{t("heapMemoryLabel")}</span>
                </div>
                <span className="text-sm font-medium">{health.memory.usedMb} MB / {health.memory.totalMb} MB</span>
              </div>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    (health.memory.usedMb / health.memory.totalMb) > 0.85 ? "bg-red-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${Math.min(100, (health.memory.usedMb / health.memory.totalMb) * 100)}%` }}
                />
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
