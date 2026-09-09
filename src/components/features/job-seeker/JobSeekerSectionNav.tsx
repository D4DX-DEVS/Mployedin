"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { getNavGroups, type NavBadgeKey } from "@/lib/nav/menuConfig";
import { getIcon } from "@/lib/nav/iconRegistry";
import { cn } from "@/lib/utils";

/**
 * The row of related destinations that belongs to a hub page.
 *
 * Applications, Interviews, Offers and Onboarding are four stages of one
 * application, and CV, Skills, Documents, Portfolio and preferences are all
 * parts of one profile — but each was its own entry in a "More" menu that had
 * grown to eighteen items, so finding any of them meant remembering which
 * bucket it had been filed under. They now hang off the page they belong to.
 *
 * Labels, icons and badge keys come from `menuConfig`, the same source the
 * command palette reads, so a renamed entry cannot drift between the menu and
 * its hub. A badge renders only when its count is above zero: the row exists to
 * move between stages, and a "0" on every pill is noise.
 */

interface JobSeekerSectionNavProps {
  locale: string;
  /** Locale-less paths, in display order, e.g. "/job-seeker/interviews". */
  paths: readonly string[];
  /** Live counters keyed by the `badgeKey` a menuConfig entry declares. */
  counts?: Partial<Record<NavBadgeKey, number>>;
  /** Accessible name of the row; defaults to the first entry's title. */
  label?: string;
  className?: string;
}

const BADGE_CAP = 99;

export function JobSeekerSectionNav({ locale, paths, counts, label, className }: JobSeekerSectionNavProps) {
  const pathname = usePathname();
  const t = useTranslations("jobSeekerJourney");
  const items = getNavGroups("job_seeker", locale).flatMap((group) => group.items);
  const activeRef = useRef<HTMLAnchorElement>(null);

  type SectionEntry = { href: string; title: string; icon: string; badgeKey?: NavBadgeKey };
  const entries: SectionEntry[] = [];
  for (const path of paths) {
    const href = `/${locale}${path}`;
    const item = items.find((entry) => entry.href === href);
    if (item) {
      entries.push({
        href,
        title: locale === "ar" ? item.titleAr : item.title,
        icon: item.icon,
        badgeKey: item.badgeKey,
      });
    }
  }

  // Phones show three pills at most; the current stage must not sit off-screen.
  useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [pathname]);

  if (entries.length === 0) return null;

  return (
    <nav
      className={cn("scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1", className)}
      aria-label={label ?? entries[0]?.title}
    >
      {entries.map((entry) => {
        const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
        const Icon = getIcon(entry.icon);
        const count = entry.badgeKey ? counts?.[entry.badgeKey] ?? 0 : 0;
        // The visible badge caps at BADGE_CAP ("99+"); the announced count
        // must be derived from the same capped value so a screen reader
        // never reports a number the sighted badge doesn't show.
        const displayCount = Math.min(count, BADGE_CAP);
        return (
          <Link
            key={entry.href}
            ref={active ? activeRef : undefined}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            aria-label={count > 0 ? t("attention", { title: entry.title, count: displayCount }) : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {entry.title}
            {count > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "ms-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground"
                )}
              >
                {count > BADGE_CAP ? `${displayCount}+` : displayCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** The application lifecycle: applied, interviewing, offered, onboarding. */
export const APPLICATION_JOURNEY_PATHS = [
  "/job-seeker/applications",
  "/job-seeker/interviews",
  "/job-seeker/offers",
  "/job-seeker/onboarding",
] as const;

/** Everything that makes up how the seeker presents themselves. */
export const PROFILE_SECTION_PATHS = [
  "/job-seeker/profile",
  "/job-seeker/profile/personal-details",
  "/job-seeker/cv",
  "/job-seeker/skills",
  "/job-seeker/documents",
  "/job-seeker/preferences",
] as const;
