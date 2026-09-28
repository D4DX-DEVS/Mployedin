"use client";

import { useTranslations } from "next-intl";
import { Filter } from "lucide-react";
import { ReportCardHeader, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import type { CustomerConversion } from "@/components/features/subscription-dashboard/useSubscriptionDashboard";
import { formatCount } from "@/lib/ui/intlFormat";

/**
 * The one funnel: customer accounts → verified email → on a paid plan, per
 * customer role. The old funnel started from every user (staff included), had
 * an "Onboarded" stage no account ever reaches, and ended in renewal events.
 */
export function PayingCustomers({ conversion, locale, className = "" }: {
  conversion: { employer: CustomerConversion; jobSeeker: CustomerConversion };
  locale: string;
  className?: string;
}) {
  const t = useTranslations("adminSubscriptionDashboard");
  const count = (value: number) => formatCount(value, undefined, locale);
  const groups = [
    { key: "employer", label: t("roleEmployers"), data: conversion.employer },
    { key: "jobSeeker", label: t("roleJobSeekers"), data: conversion.jobSeeker },
  ];

  return (
    <section className={`${reportCardClassName} ${className}`} aria-label={t("payingCustomers")}>
      <ReportCardHeader title={t("payingCustomers")} description={t("payingCustomersDescription")} icon={Filter} tone="workspace-tone-emerald" />

      <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {groups.map((group) => {
          const stages = [
            { key: "accounts", label: t("stageAccounts"), value: group.data.accounts },
            { key: "verified", label: t("stageVerified"), value: group.data.verified },
            { key: "paid", label: t("stagePaid"), value: group.data.paid },
          ];
          return (
            <div key={group.key} data-conversion={group.key}>
              <h3 className="text-xs font-semibold text-muted-foreground">{group.label}</h3>
              <ol className="mt-2 space-y-2.5">
                {stages.map((stage) => {
                  // Each stage against all accounts, never step to step: a paid
                  // account need not have verified its email.
                  const share = group.data.accounts > 0 ? Math.round((stage.value / group.data.accounts) * 100) : 0;
                  return (
                    <li key={stage.key} data-stage={stage.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-foreground">{stage.label}</span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {count(stage.value)}
                          {stage.key !== "accounts" ? <span className="ms-1.5 text-xs font-normal text-muted-foreground">{share}%</span> : null}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full ${stage.key === "paid" ? "bg-emerald-500" : "bg-primary"}`}
                          style={{ width: `${stage.value === 0 ? 0 : Math.max(2, share)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
