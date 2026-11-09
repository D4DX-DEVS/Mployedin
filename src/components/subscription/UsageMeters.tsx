"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import type { MySubscription } from "@/hooks/useSubscription";
import { percentUsed, usageLevel, usageRows, UNLIMITED, type CustomerRole } from "./planBillingModel";

const BAR: Record<string, string> = { ok: "bg-sky-500", near: "bg-amber-500", full: "bg-red-500" };

/**
 * What the plan allows against what has been used. While enforcement is off
 * the numbers still show, but nothing is called "near the limit" because
 * nothing is being limited.
 */
export function UsageMeters({ role, subscription, enforced }: { role: CustomerRole; subscription: MySubscription; enforced: boolean }) {
  const t = useTranslations("planBilling");
  const rows = usageRows(role, subscription);
  const resets = subscription.usageResetAt
    ? formatDate(subscription.usageResetAt, { day: "numeric", month: "short" })
    : null;
  const tight = enforced ? rows.find((r) => usageLevel(r) !== "ok") : undefined;

  return (
    <section aria-labelledby="usage-title" className="space-y-2">
      <h3 id="usage-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("usage")}</h3>
      <div className={cn("grid gap-3", rows.length > 1 ? "sm:grid-cols-3" : "sm:max-w-sm")}>
        {rows.map((row) => {
          const unlimited = row.max === UNLIMITED;
          const pct = percentUsed(row);
          const level = enforced ? usageLevel(row) : "ok";
          return (
            <div key={row.key} className="rounded-xl border border-border/60 bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm">{t(`usage_${row.key}`)}</span>
                <span className="shrink-0 text-lg font-bold tabular-nums">
                  {row.used}
                  <span className="text-xs font-normal text-muted-foreground"> / {unlimited ? t("noLimit") : row.max}</span>
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={t(`usage_${row.key}`)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div className={cn("h-full rounded-full", BAR[level])} style={{ width: `${unlimited ? 3 : Math.max(pct, 3)}%` }} />
              </div>
              <p className={cn("mt-1.5 text-xs", level === "ok" ? "text-muted-foreground" : "font-medium text-amber-700")}>
                {!enforced
                  ? t("notLimitedYet")
                  : unlimited
                    ? t("noLimitOnPlan")
                    : resets && row.key !== "activeJobs" && row.key !== "teamSeats"
                      ? t("pctUsedResets", { pct, date: resets })
                      : t("pctUsed", { pct })}
              </p>
            </div>
          );
        })}
      </div>
      {tight && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm">
            <span className="font-semibold">{usageLevel(tight) === "full" ? t("atLimitTitle") : t("nearLimitTitle")}</span>{" "}
            {role === "employer"
              ? t("nearLimitEmployer")
              : t("nearLimitSeeker", { left: Math.max(0, tight.max - tight.used) })}
          </p>
        </div>
      )}
    </section>
  );
}
