import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Database, KeyRound, Mail, ShieldCheck, Webhook } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import type { HealthCheck, HealthCheckId, HealthStatus } from "@/lib/admin/dashboard/types";
import type { DashboardTranslator } from "./types";

const STATUS: Record<HealthStatus, { icon: LucideIcon; pill: string; tile: string }> = {
  healthy: { icon: CheckCircle2, pill: "bg-emerald-100 text-emerald-800", tile: "ring-border/70 bg-card" },
  warning: { icon: CircleAlert, pill: "bg-amber-100 text-amber-900", tile: "ring-amber-200 bg-amber-50/60" },
  critical: { icon: AlertTriangle, pill: "bg-rose-100 text-rose-800", tile: "ring-rose-200 bg-rose-50/60" },
};

const CHECKS: Record<HealthCheckId, { key: string; icon: LucideIcon }> = {
  database: { key: "database", icon: Database },
  email: { key: "email", icon: Mail },
  webhooks: { key: "webhooks", icon: Webhook },
  authentication: { key: "authentication", icon: KeyRound },
};

function valueText(check: HealthCheck, t: DashboardTranslator): string {
  const { key } = CHECKS[check.id];
  if (check.id === "database") return t("health.databaseValue", { value: check.value });
  if (check.id === "authentication") return t("health.authenticationValue", { count: check.value, failed: check.secondary ?? 0 });
  return t(`health.${key}Value`, { count: check.value });
}

interface Props {
  checks: readonly HealthCheck[];
  locale: string;
  t: DashboardTranslator;
}

/** Technical checks measured on this request, each linking to where it is fixed. */
export function HealthPanel({ checks, locale, t }: Props) {
  const problems = checks.filter((check) => check.status !== "healthy").length;
  return (
    <Panel
      id="admin-health"
      icon={ShieldCheck}
      iconClassName={problems === 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}
      title={t("health.title")}
      subtitle={problems === 0 ? t("health.allHealthy") : t("health.problems", { count: problems })}
      action={{ href: `/${locale}/admin/system-health`, label: t("health.viewAll") }}
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {checks.map((check) => {
          const style = STATUS[check.status];
          const { key, icon: CheckIcon } = CHECKS[check.id];
          const StatusIcon = style.icon;
          const tile = `flex h-full items-center gap-2.5 rounded-lg px-2.5 py-2 ring-1 ring-inset ${style.tile}`;
          const body = (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground ring-1 ring-inset ring-border/60">
                <CheckIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-foreground">{t(`health.${key}`)}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${style.pill}`}>
                    <StatusIcon className="h-3 w-3" aria-hidden="true" />
                    {t(`health.status.${check.status}`)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">{valueText(check, t)}</span>
              </span>
              {check.path && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />}
            </>
          );
          return (
            <li key={check.id} data-health-id={check.id} data-status={check.status}>
              {check.path ? (
                <Link href={`/${locale}${check.path}`} className={`group ${tile} transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
                  {body}
                </Link>
              ) : (
                <div className={tile}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
