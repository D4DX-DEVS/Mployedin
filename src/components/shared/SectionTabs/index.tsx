"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup, NavItem } from "@/lib/nav/menuConfig";

interface SectionTabsProps {
  navGroups: NavGroup[];
  locale: string;
}

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The stage strip for a grouped section.
 *
 * Collapsing thirteen sidebar rows into six put Applications, Interviews,
 * Offers and Placements behind a parent, which meant a second click to move
 * between them — the four pages an employer moves between most. The group is
 * still the right shape; the fix is to keep its members on screen once the
 * user is inside it, so switching stage is one click and the section reads as
 * one workspace rather than four destinations that happen to be adjacent.
 *
 * It is driven by the same nav config as the sidebar, so a section gains a tab
 * by gaining a child — there is no second list to keep in step.
 */
export function SectionTabs({ navGroups, locale }: SectionTabsProps) {
  const pathname = usePathname();
  const items = navGroups.flatMap((group) => group.items);

  let section: NavItem | undefined;
  for (const item of items) {
    if (!item.children?.length) continue;
    if (item.children.some((child) => matches(pathname, child.href))) {
      section = item;
      break;
    }
  }

  // One tab is a label, not a choice.
  if (!section || (section.children?.length ?? 0) < 2) return null;

  return (
    <nav
      aria-label={locale === "ar" ? section.titleAr : section.title}
      className="-mb-px flex items-center gap-1 overflow-x-auto scrollbar-none"
    >
      {section.children!.map((child) => {
        const active = matches(pathname, child.href);
        return (
          <Link
            key={child.href}
            href={child.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {locale === "ar" ? child.titleAr : child.title}
          </Link>
        );
      })}
    </nav>
  );
}
