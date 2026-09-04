"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

/**
 * One strip across every admin report.
 *
 * There are five reporting destinations and they sit in three different
 * sidebar groups: the platform report and the AI summary under Insight, the
 * target and commission reports under Finance, and the subscription dashboard
 * under Finance as well. Their names did not help either — the page called
 * "Reports" rendered analytics and the page called "Analytics" rendered an
 * AI-written narrative — so an admin looking for a number opened two or three
 * pages to find it.
 *
 * The routes stay where they are; this makes the set visible from any one of
 * them, which is what a tab strip is for.
 */
const TABS = [
  { key: "platform", href: "/admin/reports" },
  { key: "aiInsights", href: "/admin/analytics" },
  { key: "targets", href: "/admin/target-report" },
  { key: "commissions", href: "/admin/commissions-report" },
  { key: "subscriptions", href: "/admin/subscription-dashboard" },
] as const;

export function ReportTabs() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("adminReportTabs");

  return (
    <nav aria-label={t("tabsLabel")} className="-mx-1 mb-4 overflow-x-auto px-1">
      <ul className="flex w-max min-w-full items-center gap-1 rounded-xl border border-border/70 bg-card/60 p-1">
        {TABS.map((tab) => {
          const href = `/${locale}${tab.href}`;
          const isActive = pathname === href;
          return (
            <li key={tab.key}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors sm:min-h-9 ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
