"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { toast } from "sonner";
import {
  Activity, Database, Clock, Cpu, HardDrive, Webhook as WebhookIcon,
  AlertTriangle, CheckCircle2, XCircle, RefreshCcw, Users,
  Zap, LifeBuoy, CreditCard, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, formatTime } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Mirrors `/api/admin/system-health` exactly.
 *
 * Every field here is measured by that route. The panel used to carry an API
 * card (a hardcoded "healthy" plus a random request count), a storage card with
 * constant gigabytes, a 99.9% uptime figure and a cron block that always read
 * "0 failed" — an operator checking whether the platform was in trouble was
 * told, unconditionally, that it was not. Request rates, error rates and
 * platform uptime need a metrics store this deployment does not have, so they
 * are absent rather than invented.
 */
interface SystemHealth {
  database: { status: string; latencyMs: number; connections: number };
  /** null when the hosting tier refuses `dbStats` — rendered as unavailable. */
  storage: { dataMb: number; storageMb: number; indexMb: number } | null;
  integrations: { status: string; active: number; failing: number };
  support: { status: string; openTickets: number; unreadSubmissions: number };
  users: { activeLast24h: number; totalActive: number; totalRegistered: number };
  jobs: { active: number; total: number; applicationsToday: number };
  subscriptionPlans: {
    status: string;
    enforcementEnabled: boolean;
    employer: { activePlans: number; hasDefault: boolean };
    jobSeeker: { activePlans: number; hasDefault: boolean };
  };
  process: { uptimeSeconds: number; memoryUsedMb: number; memoryTotalMb: number };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminSystemHealthPage() {
  const t = useTranslations("adminSystemHealth");
  const locale = useLocale();
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

  /* The worst of the four measured statuses, so the header chip cannot read
     "operational" while a component underneath is critical. */
  const overallStatus = health
    ? [health.database.status, health.integrations.status, health.support.status, health.subscriptionPlans.status]
        .reduce((worst, status) => {
          if (worst === "critical" || status === "critical") return "critical";
          if (worst === "warning" || status === "warning") return "warning";
          return "healthy";
        }, "healthy")
    : "unknown";

  const uptimeLabel = (seconds: number) => {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return t("uptimeDaysHours", { days, hours });
    if (hours > 0) return t("uptimeHoursMinutes", { hours, minutes });
    return t("uptimeMinutes", { minutes });
  };

  return (
    <div className="page-container">
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={Activity}
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={
          <>
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase ${getStatusColor(overallStatus)}`}>
              {getStatusIcon(overallStatus)}
              {overallStatus === "healthy" ? t("statusOperational") : overallStatus === "critical" ? t("statusCritical") : overallStatus === "warning" ? t("statusDegraded") : t("statusChecking")}
            </div>
            <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading} className="max-sm:min-h-11">
              <RefreshCcw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> {t("buttonRefresh")}
            </Button>
          </>
        }
        footer={
          <p className="text-xs text-muted-foreground">
            {t("lastUpdatedLabel")} {lastRefresh ? formatTime(lastRefresh) : "—"} · {t("autoRefreshLabel")} · {t("measuredOnlyNote")}
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
          {/* Core Services — measured infrastructure */}
          <section className="workspace-panel-surface rounded-3xl panel-body">
            <h2 className="heading-label mb-4 font-semibold uppercase tracking-wider text-muted-foreground">{t("coreServicesHeading")}</h2>
            <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                    <span className="font-medium tabular-nums">{health.database.latencyMs}ms</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("connectionsLabel")}</span>
                    <span className="font-medium tabular-nums">{health.database.connections}</span>
                  </div>
                </div>
              </div>

              {/* Storage — real dbStats, or an honest "unavailable" */}
              <div className="workspace-glass-panel rounded-2xl panel-body">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5 text-violet-500" />
                    <span className="font-medium text-foreground">{t("storageLabel")}</span>
                  </div>
                  {health.storage ? getStatusIcon("healthy") : getStatusIcon("unknown")}
                </div>
                <div className="mt-4 space-y-2">
                  {health.storage ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("dataSizeLabel")}</span>
                        <span className="font-medium tabular-nums">{formatCount(health.storage.dataMb)} MB</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("indexSizeLabel")}</span>
                        <span className="font-medium tabular-nums">{formatCount(health.storage.indexMb)} MB</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("allocatedLabel")}</span>
                        <span className="font-medium tabular-nums">{formatCount(health.storage.storageMb)} MB</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("storageUnavailable")}</p>
                  )}
                </div>
              </div>

              {/* Integrations — webhook delivery health */}
              <div className="workspace-glass-panel rounded-2xl panel-body">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <WebhookIcon className="h-5 w-5 text-sky-500" />
                    <span className="font-medium text-foreground">{t("integrationsLabel")}</span>
                  </div>
                  {getStatusIcon(health.integrations.status)}
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("activeWebhooksLabel")}</span>
                    <span className="font-medium tabular-nums">{health.integrations.active}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("failingWebhooksLabel")}</span>
                    <span className={`font-medium tabular-nums ${health.integrations.failing > 0 ? "text-red-600" : ""}`}>{health.integrations.failing}</span>
                  </div>
                  {health.integrations.failing > 0 && (
                    <Link
                      href={`/${locale}/admin/webhooks?status=failed`}
                      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0"
                    >
                      {t("openFailingWebhooks")} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Operational backlog — things waiting on a human */}
          <section className="workspace-panel-surface rounded-3xl panel-body">
            <h2 className="heading-label mb-4 font-semibold uppercase tracking-wider text-muted-foreground">{t("backlogHeading")}</h2>
            <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-2">
              <div className="workspace-glass-panel rounded-2xl panel-body">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LifeBuoy className="h-5 w-5 text-teal-500" />
                    <span className="font-medium text-foreground">{t("supportLabel")}</span>
                  </div>
                  {getStatusIcon(health.support.status)}
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("openTicketsLabel")}</span>
                    <span className="font-medium tabular-nums">{health.support.openTickets}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("unreadSubmissionsLabel")}</span>
                    <span className="font-medium tabular-nums">{health.support.unreadSubmissions}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4">
                    {health.support.openTickets > 0 && (
                      <Link href={`/${locale}/admin/messages?tab=support`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0">
                        {t("openSupportInbox")} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {health.support.unreadSubmissions > 0 && (
                      <Link href={`/${locale}/admin/cms/contact-submissions`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0">
                        {t("openContactInbox")} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              <div className="workspace-glass-panel rounded-2xl panel-body">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-amber-500" />
                    <span className="font-medium text-foreground">{t("subscriptionCatalogueLabel")}</span>
                  </div>
                  {getStatusIcon(health.subscriptionPlans.status)}
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("employerPlansLabel")}</span>
                    <span className="font-medium tabular-nums">
                      {health.subscriptionPlans.employer.activePlans}
                      {!health.subscriptionPlans.employer.hasDefault && ` · ${t("noDefaultPlan")}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("jobSeekerPlansLabel")}</span>
                    <span className="font-medium tabular-nums">
                      {health.subscriptionPlans.jobSeeker.activePlans}
                      {!health.subscriptionPlans.jobSeeker.hasDefault && ` · ${t("noDefaultPlan")}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("enforcementLabel")}</span>
                    <span className="font-medium">{health.subscriptionPlans.enforcementEnabled ? t("enforcementOn") : t("enforcementOff")}</span>
                  </div>
                  {health.subscriptionPlans.status !== "healthy" && (
                    <Link href={`/${locale}/admin/subscription-plans`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0">
                      {t("openSubscriptionPlans")} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Platform Metrics — counted, not sampled */}
          <section className="workspace-panel-surface rounded-3xl panel-body">
            <h2 className="heading-label mb-4 font-semibold uppercase tracking-wider text-muted-foreground">{t("platformMetricsHeading")}</h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
              <div className="workspace-glass-panel card-pad rounded-2xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("activeUsersLabel")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCount(health.users.totalActive)}</p>
                <p className="text-xs text-muted-foreground">{formatCount(health.users.activeLast24h)} {t("signedInLast24h")}</p>
              </div>

              <div className="workspace-glass-panel card-pad rounded-2xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("activeJobsLabel")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCount(health.jobs.active)}</p>
                <p className="text-xs text-muted-foreground">{health.jobs.applicationsToday} {t("applicationsTodayLabel")}</p>
              </div>

              <div className="workspace-glass-panel card-pad rounded-2xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("processUptimeLabel")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{uptimeLabel(health.process.uptimeSeconds)}</p>
                <p className="text-xs text-muted-foreground">{t("processUptimeNote")}</p>
              </div>

              <div className="workspace-glass-panel card-pad rounded-2xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Cpu className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("heapMemoryLabel")}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{health.process.memoryUsedMb} MB</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (health.process.memoryUsedMb / health.process.memoryTotalMb) > 0.85 ? "bg-red-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.min(100, (health.process.memoryUsedMb / health.process.memoryTotalMb) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("heapOfTotal", { total: health.process.memoryTotalMb })}</p>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
