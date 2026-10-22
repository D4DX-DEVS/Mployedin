"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ADMIN_REPORT_TABS, type ReportTab } from "@/lib/nav/reportRoutes";

interface ReportTabsProps {
  /** Defaults to the admin set; the super-agent pages pass their own. */
  tabs?: readonly ReportTab[];
  /** Message namespace holding `tabsLabel` and one label per tab key. */
  namespace?: "adminReportTabs" | "superAgentReportTabs";
}

/**
 * One strip across every report in a workspace.
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
export function ReportTabs({ tabs = ADMIN_REPORT_TABS, namespace = "adminReportTabs" }: ReportTabsProps = {}) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations(namespace);

  return (
    <nav aria-label={t("tabsLabel")} className="-mx-1 mb-4 overflow-x-auto px-1">
      <ul className="flex w-max min-w-full items-center gap-1 rounded-xl border border-border/70 bg-card/60 p-1">
        {tabs.map((tab) => {
          const href = `/${locale}${tab.path}`;
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
