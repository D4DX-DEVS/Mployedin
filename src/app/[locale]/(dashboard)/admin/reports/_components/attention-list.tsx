"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, Briefcase, CheckCircle2, ChevronRight, Clock3, Target, TrendingDown } from "lucide-react";
import { PLATFORM_ALERT_ACTIONS } from "@/lib/admin/platformAlerts";

export interface AlertItem {
  id: string;
  level: "critical" | "warning" | "positive";
  values?: Record<string, number>;
}

/* `/api/admin/analytics` has no locale, so it sends an alert id plus the numbers
   behind it rather than a finished sentence. The mapping lives here, spelled out
   per id so the keys stay statically greppable. An id this map doesn't know is
   skipped rather than rendered — next-intl throws on an unknown key.
   `href` is where the admin acts on the finding; null renders a plain row. The
   paths come from the shared alert registry, so the link the dashboard uses and
   the link this page uses are the same one. */
const ALERT_META: Record<string, {
  titleKey: string;
  descriptionKey: string;
  Icon: typeof AlertTriangle;
  href: string | null;
}> = {
  "jobs-without-applications": {
    titleKey: "alertJobsWithoutDemandTitle",
    descriptionKey: "alertJobsWithoutDemandDescription",
    Icon: Briefcase,
    href: PLATFORM_ALERT_ACTIONS["jobs-without-applications"].path,
  },
  "stale-open-applications": {
    titleKey: "alertStaleApplicationsTitle",
    descriptionKey: "alertStaleApplicationsDescription",
    Icon: Clock3,
    href: PLATFORM_ALERT_ACTIONS["stale-open-applications"].path,
  },
  "zero-placement-momentum": {
    titleKey: "alertNoPlacementMomentumTitle",
    descriptionKey: "alertNoPlacementMomentumDescription",
    Icon: Target,
    href: PLATFORM_ALERT_ACTIONS["zero-placement-momentum"].path,
  },
  "demand-softening": {
    titleKey: "alertDemandSofteningTitle",
    descriptionKey: "alertDemandSofteningDescription",
    Icon: TrendingDown,
    href: PLATFORM_ALERT_ACTIONS["demand-softening"].path,
  },
  "platform-stable": {
    titleKey: "alertPlatformStableTitle",
    descriptionKey: "alertPlatformStableDescription",
    Icon: CheckCircle2,
    href: null,
  },
};

/* Palette utilities on purpose: the semantic `bg-status-*` classes are not
   registered in the Tailwind v4 @theme block yet, so they compile to nothing. */
const LEVEL_CHIP: Record<AlertItem["level"], string> = {
  critical: "bg-rose-50 text-rose-600",
  warning: "bg-amber-50 text-amber-600",
  positive: "bg-emerald-50 text-emerald-600",
};

/** The dashboard's attention findings as compact rows, each linking to where the admin acts. */
export function AttentionList({ alerts, locale }: { alerts: AlertItem[]; locale: string }) {
  const t = useTranslations("adminReports");

  return (
    <div className="mt-4 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
      {alerts.map((alert) => {
        const meta = ALERT_META[alert.id];
        if (!meta) return null;
        // The softening delta arrives signed; the sentence already says "down".
        const values = alert.id === "demand-softening"
          ? { ...alert.values, delta: Math.abs(alert.values?.delta ?? 0) }
          : alert.values ?? {};
        const FindingIcon = meta.Icon;
        const inner = (
          <>
            <span className={`shrink-0 rounded-xl p-2 ${LEVEL_CHIP[alert.level]}`}>
              <FindingIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{t(meta.titleKey, values)}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{t(meta.descriptionKey, values)}</span>
            </span>
          </>
        );

        return meta.href ? (
          <Link key={alert.id} href={`/${locale}${meta.href}`} data-alert-level={alert.level} className="flex min-h-11 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/40">
            {inner}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
          </Link>
        ) : (
          <div key={alert.id} data-alert-level={alert.level} className="flex min-h-11 items-center gap-3 px-3.5 py-3">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
