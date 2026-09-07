"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavGroups } from "@/lib/nav/menuConfig";
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
 * Labels and icons come from `menuConfig`, the same source the command palette
 * reads, so a renamed entry cannot drift between the menu and its hub.
 */

interface JobSeekerSectionNavProps {
  locale: string;
  /** Locale-less paths, in display order, e.g. "/job-seeker/interviews". */
  paths: readonly string[];
  className?: string;
}

export function JobSeekerSectionNav({ locale, paths, className }: JobSeekerSectionNavProps) {
  const pathname = usePathname();
  const items = getNavGroups("job_seeker", locale).flatMap((group) => group.items);

  type SectionEntry = { href: string; title: string; icon: string };
  const entries: SectionEntry[] = [];
  for (const path of paths) {
    const href = `/${locale}${path}`;
    const item = items.find((entry) => entry.href === href);
    if (item) entries.push({ href, title: locale === "ar" ? item.titleAr : item.title, icon: item.icon });
  }

  if (entries.length === 0) return null;

  return (
    <nav
      className={cn("scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1", className)}
      aria-label={entries[0]?.title}
    >
      {entries.map((entry) => {
        const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
        const Icon = getIcon(entry.icon);
        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {entry.title}
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
