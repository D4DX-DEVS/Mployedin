"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import type { NavGroup, NavItem } from "@/lib/nav/menuConfig";

interface WorkspaceBreadcrumbProps {
  navGroups: NavGroup[];
  locale: string;
  /** Workspace root, e.g. "/en/employer" — rendered as the first crumb. */
  rootHref: string;
  rootLabel: string;
}

interface Crumb {
  label: string;
  href?: string;
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flatten(item.children) : [])]);
}

function titleize(segment: string): string {
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * A way back up from a deep page.
 *
 * Three levels in — `placements/[id]/onboarding` — the only routes out were the
 * browser button and the sidebar, and the sidebar drops whatever filters the
 * list was holding. Labels come from the nav config where a route has one, so
 * the crumb and the menu never disagree.
 */
export function WorkspaceBreadcrumb({
  navGroups,
  locale,
  rootHref,
  rootLabel,
}: WorkspaceBreadcrumbProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const isAr = locale === "ar";

  if (!pathname || pathname === rootHref) return null;

  const navItems = flatten(navGroups.flatMap((group) => group.items));
  const labelFor = (href: string): string | null => {
    const match = navItems.find((item) => item.href === href);
    if (!match) return null;
    return isAr ? match.titleAr : match.title;
  };

  const rest = pathname.slice(rootHref.length).split("/").filter(Boolean);
  if (rest.length === 0) return null;

  const crumbs: Crumb[] = [{ label: rootLabel, href: rootHref }];
  let walked = rootHref;

  rest.forEach((segment, index) => {
    walked += `/${segment}`;
    const isLast = index === rest.length - 1;
    // A record id is not a name; without fetching the record, "Details" is the
    // honest label — better than showing a raw ObjectId.
    const label = OBJECT_ID.test(segment)
      ? t("breadcrumbDetails")
      : labelFor(walked) ?? titleize(segment);
    crumbs.push({ label, href: isLast ? undefined : walked });
  });

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-3 w-3 shrink-0 opacity-60 rtl:rotate-180" aria-hidden />
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                prefetch={false}
                className="max-w-[12rem] truncate rounded transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="max-w-[14rem] truncate font-medium text-foreground">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
