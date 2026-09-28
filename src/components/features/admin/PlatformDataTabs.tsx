"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

/**
 * One control across every platform lookup table.
 *
 * Twenty-seven tables would not fit in a single tab strip, so they are grouped
 * (Jobs, Candidate, Company, Education, Locations, Finance). The group row is
 * always visible; the second row lists the tables of the active group. Every
 * original route still resolves, so existing links and bookmarks keep working.
 */
type Tab = { key: string; href: string };
type Group = { key: string; tabs: readonly Tab[] };

const GROUPS: readonly Group[] = [
  {
    key: "groupJobs",
    tabs: [
      { key: "jobRoles", href: "/admin/job-attributes/job-roles" },
      { key: "functionalAreas", href: "/admin/job-attributes/functional-areas" },
      { key: "industries", href: "/admin/job-attributes/industries" },
      { key: "jobSkills", href: "/admin/job-attributes/job-skills" },
      { key: "jobTypes", href: "/admin/job-attributes/job-types" },
      { key: "jobShifts", href: "/admin/job-attributes/job-shifts" },
      { key: "careerLevels", href: "/admin/job-attributes/career-levels" },
      { key: "jobExperiences", href: "/admin/job-attributes/job-experiences" },
      { key: "benefits", href: "/admin/job-attributes/benefits" },
    ],
  },
  {
    key: "groupCandidate",
    tabs: [
      { key: "genders", href: "/admin/job-attributes/genders" },
      { key: "maritalStatuses", href: "/admin/job-attributes/marital-statuses" },
      { key: "nationalities", href: "/admin/job-attributes/nationalities" },
      { key: "visaStatuses", href: "/admin/job-attributes/visa-statuses" },
      { key: "noticePeriods", href: "/admin/job-attributes/notice-periods" },
      { key: "languages", href: "/admin/job-attributes/languages" },
      { key: "languageLevels", href: "/admin/job-attributes/language-levels" },
    ],
  },
  {
    key: "groupCompany",
    tabs: [
      { key: "ownershipTypes", href: "/admin/job-attributes/ownership-types" },
      { key: "companySizes", href: "/admin/job-attributes/company-sizes" },
    ],
  },
  {
    key: "groupEducation",
    tabs: [
      { key: "degreeLevels", href: "/admin/job-attributes/degree-levels" },
      { key: "degreeTypes", href: "/admin/job-attributes/degree-types" },
      { key: "majorSubjects", href: "/admin/job-attributes/major-subjects" },
      { key: "resultTypes", href: "/admin/job-attributes/result-types" },
    ],
  },
  {
    key: "groupLocations",
    tabs: [
      { key: "countries", href: "/admin/location-data/countries" },
      { key: "states", href: "/admin/location-data/states" },
      { key: "cities", href: "/admin/location-data/cities" },
    ],
  },
  {
    key: "groupFinance",
    tabs: [
      { key: "currencies", href: "/admin/job-attributes/currencies" },
      { key: "salaryPeriods", href: "/admin/job-attributes/salary-periods" },
    ],
  },
];

export function PlatformDataTabs() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("adminPlatformData");

  const activeGroup =
    GROUPS.find((g) => g.tabs.some((tab) => pathname === `/${locale}${tab.href}`)) ?? GROUPS[0];

  const pill = (active: boolean, size: "sm" | "md") =>
    `inline-flex items-center whitespace-nowrap rounded-lg font-medium transition-colors ${
      size === "md" ? "min-h-11 px-3 text-sm sm:min-h-9" : "min-h-9 px-2.5 text-xs sm:min-h-8"
    } ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  return (
    <nav aria-label={t("tabsLabel")} className="mb-4 space-y-2">
      {/* Group row — scrolls inside its own container on a phone. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <ul className="flex w-max min-w-full items-center gap-1 rounded-xl border border-border/70 bg-card/60 p-1">
          {GROUPS.map((group) => {
            const isActive = group.key === activeGroup.key;
            const first = group.tabs[0];
            return (
              <li key={group.key}>
                <Link
                  href={`/${locale}${first.href}`}
                  aria-current={isActive ? "true" : undefined}
                  className={pill(isActive, "md")}
                >
                  {t(group.key)}
                  <span
                    className={`ms-1.5 rounded-full px-1.5 text-[10px] tabular-nums ${
                      isActive ? "bg-primary-foreground/20" : "bg-muted"
                    }`}
                  >
                    {group.tabs.length}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {/* Tables inside the active group. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <ul className="flex w-max min-w-full items-center gap-1 px-1">
          {activeGroup.tabs.map((tab) => {
            const href = `/${locale}${tab.href}`;
            const isActive = pathname === href;
            return (
              <li key={tab.key}>
                <Link href={href} aria-current={isActive ? "page" : undefined} className={pill(isActive, "sm")}>
                  {t(tab.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
