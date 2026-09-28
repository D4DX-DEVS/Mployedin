"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Layers } from "lucide-react";
import { ReportCardHeader, ReportEmpty, reportCardClassName, reportLinkClassName } from "@/components/features/admin/reports/ReportCard";
import type { PlanMixRow } from "@/components/features/subscription-dashboard/useSubscriptionDashboard";
import { formatCount } from "@/lib/ui/intlFormat";

const ROLES = [
  { role: "employer", labelKey: "roleEmployers" },
  { role: "job_seeker", labelKey: "roleJobSeekers" },
] as const;

/**
 * Every active plan once: how many are on it and what it brings in a month.
 * Replaces a plan table, a revenue pie and a "funnel" that were three views of
 * the same active-subscription count.
 */
export function PlanMix({ plans, currency, locale, className = "" }: {
  plans: PlanMixRow[];
  currency: string;
  locale: string;
  className?: string;
}) {
  const t = useTranslations("adminSubscriptionDashboard");
  const money = (value: number) => formatCount(value, { style: "currency", currency, maximumFractionDigits: 0 }, locale);

  return (
    <section className={`${reportCardClassName} ${className}`} aria-label={t("planMix")}>
      <ReportCardHeader title={t("planMix")} description={t("planMixDescription", { currency })} icon={Layers} tone="workspace-tone-indigo" />

      {plans.length === 0 ? (
        <ReportEmpty>{t("noActiveSubscriptions")}</ReportEmpty>
      ) : (
        <div className="mt-4 space-y-4">
          {ROLES.map(({ role, labelKey }) => {
            const rows = plans.filter((plan) => plan.role === role);
            if (rows.length === 0) return null;
            return (
              <div key={role}>
                <h3 className="text-xs font-semibold text-muted-foreground">{t(labelKey)}</h3>
                <ul className="mt-1.5 space-y-2">
                  {rows.map((plan) => (
                    <li key={`${plan.role}-${plan.name}-${plan.tier}`} data-plan={plan.name}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {plan.name || t("unnamedPlan", { tier: plan.tier })}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {plan.mrr > 0 ? money(plan.mrr) : t("freePlan")}
                        </span>
                      </div>
                      {/* Bar = share of monthly revenue; a free plan has none to show. */}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${plan.share === 0 ? 0 : Math.max(2, plan.share)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("planActive", { count: plan.active })}
                        {plan.mrr > 0 ? ` · ${t("planShare", { share: plan.share })}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <Link href={`/${locale}/admin/subscription-plans`} className={reportLinkClassName}>
        {t("managePlans")}
        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
      </Link>
    </section>
  );
}
