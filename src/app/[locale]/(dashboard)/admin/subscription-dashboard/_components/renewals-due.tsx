"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarClock } from "lucide-react";
import { ReportCardHeader, ReportEmpty, reportCardClassName, reportLinkClassName } from "@/components/features/admin/reports/ReportCard";
import type { RenewalsDue as RenewalsDueData } from "@/components/features/subscription-dashboard/useSubscriptionDashboard";
import { formatCount } from "@/lib/ui/intlFormat";

/**
 * What ends in the next 30 days, split by what happens next. Each count opens
 * the subscriptions list on the same window, so the numbers match the list.
 */
export function RenewalsDue({ renewals, currency, locale, className = "" }: {
  renewals: RenewalsDueData;
  currency: string;
  locale: string;
  className?: string;
}) {
  const t = useTranslations("adminSubscriptionDashboard");
  const count = (value: number) => formatCount(value, undefined, locale);
  const money = formatCount(renewals.mrrAtRisk, { style: "currency", currency, maximumFractionDigits: 0 }, locale);
  const rows = [
    { key: "auto", label: t("renewalsPaidAuto"), value: renewals.paidAutoRenew, bar: "bg-emerald-500", note: null },
    {
      key: "manual",
      label: t("renewalsPaidManual"),
      value: renewals.paidManual,
      bar: "bg-rose-500",
      note: renewals.paidManual > 0 ? t("renewalsAtStake", { amount: money }) : null,
    },
    { key: "free", label: t("renewalsFree"), value: renewals.free, bar: "bg-slate-400", note: null },
  ];
  const listHref = `/${locale}/admin/subscriptions`;

  return (
    <section className={`${reportCardClassName} ${className}`} aria-label={t("renewalsDue")}>
      <ReportCardHeader title={t("renewalsDue")} description={t("renewalsDueDescription")} icon={CalendarClock} tone="workspace-tone-amber" />

      {renewals.within30 === 0 ? (
        <ReportEmpty>{t("noRenewalsDue")}</ReportEmpty>
      ) : (
        <>
          <Link href={`${listHref}?expiring=30d`} className="mt-4 flex items-baseline gap-2 rounded-2xl bg-secondary/40 px-4 py-3 transition-colors hover:bg-secondary/70">
            <span className="text-2xl font-semibold tabular-nums text-foreground">{count(renewals.within30)}</span>
            <span className="text-sm text-muted-foreground">{t("renewalsWithin30", { count: renewals.within30 })}</span>
          </Link>
          <ul className="mt-4 space-y-3">
            {rows.map((row) => (
              <li key={row.key} data-renewal={row.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-foreground">{row.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{count(row.value)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${row.value === 0 ? 0 : Math.max(2, (row.value / renewals.within30) * 100)}%` }} />
                </div>
                {row.note ? <p className="mt-1 text-xs text-muted-foreground">{row.note}</p> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <Link href={`${listHref}?expiring=7d`} className={reportLinkClassName}>
        {t("renewalsWithin7", { count: renewals.within7 })}
        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
      </Link>
    </section>
  );
}
