"use client";

import { useLocale, useTranslations } from "next-intl";
import { ReportEmpty } from "@/components/features/admin/reports/ReportCard";
import type { ReportCategory } from "@/lib/targets/profitReport";
import { formatProfit } from "./profitFormat";

/** Invoice categories the report can name; anything newer falls back to a generic label. */
const KNOWN_CATEGORIES = new Set([
  "subscription", "recruitment", "premium_posting", "featured_promotion",
  "exhibition", "bulk_hiring", "consulting", "custom_enterprise",
]);

/** Profit split by the kind of invoice it came from, each with its share of the total. */
export function IncomeSourcesList({ byCategory, currency, emptyLabel }: {
  byCategory: ReportCategory[];
  currency: string;
  emptyLabel: string;
}) {
  const t = useTranslations("profitReport");
  const locale = useLocale();

  if (byCategory.length === 0) return <ReportEmpty>{emptyLabel}</ReportEmpty>;

  return (
    <ul className="mt-4 space-y-3">
      {byCategory.map((row) => (
        <li key={row.category}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">
              {t(KNOWN_CATEGORIES.has(row.category) ? `category_${row.category}` : "category_other")}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatProfit(row.profit, currency, locale)} · {row.share}%
            </span>
          </div>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-secondary">
            <span className="block h-full rounded-full bg-violet-500" style={{ width: `${row.share}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
