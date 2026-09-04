"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

/**
 * One control across the eight platform lookup tables.
 *
 * Marital statuses, major subjects, job skills, industries, genders, countries,
 * states and cities were eight separate sidebar entries — eight of the admin
 * workspace's fifty-two leaves — for tables that are edited a few times a year.
 * They now appear as one navigation entry with these tabs, so the group costs
 * one line in the menu instead of eight, and moving between two of them is one
 * click instead of a trip back through the sidebar.
 *
 * The routes are unchanged: every existing link and bookmark still resolves.
 */
const TABS = [
  { key: "industries", href: "/admin/job-attributes/industries" },
  { key: "jobSkills", href: "/admin/job-attributes/job-skills" },
  { key: "majorSubjects", href: "/admin/job-attributes/major-subjects" },
  { key: "maritalStatuses", href: "/admin/job-attributes/marital-statuses" },
  { key: "genders", href: "/admin/job-attributes/genders" },
  { key: "countries", href: "/admin/location-data/countries" },
  { key: "states", href: "/admin/location-data/states" },
  { key: "cities", href: "/admin/location-data/cities" },
] as const;

export function PlatformDataTabs() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("adminPlatformData");

  return (
    <nav
      aria-label={t("tabsLabel")}
      // Scrolls inside its own container on a phone; the page itself must never
      // scroll sideways.
      className="-mx-1 mb-4 overflow-x-auto px-1"
    >
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
