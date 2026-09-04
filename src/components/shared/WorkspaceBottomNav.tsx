"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, type LucideProps } from "lucide-react";
import type { FC } from "react";
import { cn } from "@/lib/utils";

export interface BottomNavTab {
  key: string;
  href: string;
  icon: FC<LucideProps>;
  label: string;
  /** Exact pathname match instead of startsWith — set on the dashboard root tab. */
  exact?: boolean;
  /**
   * Count painted on this tab. A count whose destination is a visible tab
   * belongs here rather than folded into `menuBadgeCount`, which would show it
   * on the drawer while the tab that owns it sat blank.
   */
  badgeCount?: number;
}

interface WorkspaceBottomNavProps {
  locale: string;
  tabs: BottomNavTab[];
  /** Opens the existing sidebar overlay — the "More" tab reaches everything else. */
  onOpenMenu: () => void;
  menuLabel: string;
  ariaLabel: string;
  /**
   * Raised "Create" control seated in the middle of the bar. The header is
   * hidden on phones away from the dashboard root, so without this there is no
   * way to start something new without navigating home first.
   */
  createSlot?: React.ReactNode;
  /**
   * Unread count for anything living behind "More" (today: direct messages).
   * The sidebar already badges the item itself; on a phone that sidebar is one
   * tap away, so the count has to surface on the tab that opens it.
   */
  menuBadgeCount?: number;
}

/**
 * Fixed bottom tab bar for workspace roles (employer, admin, agent,
 * super_agent) on phones. The sidebar stays the full navigation surface
 * (reachable via the last tab); this only promotes each role's daily-driver
 * destinations so they are one tap away instead of hamburger → scroll → tap.
 */
export function WorkspaceBottomNav({ locale, tabs, onOpenMenu, menuLabel, ariaLabel, createSlot, menuBadgeCount = 0 }: WorkspaceBottomNavProps) {
  const pathname = usePathname();
  // Split the tabs around the raised control rather than appending it, so the
  // create affordance reads as separate from navigation. The trailing "More"
  // button counts as an item on the right, or the split lands left of centre.
  const midpoint = Math.ceil((tabs.length + 1) / 2);
  const orderedTabs = createSlot ? [tabs.slice(0, midpoint), tabs.slice(midpoint)] : [tabs, []];

  function isActive(tab: BottomNavTab) {
    const full = `/${locale}${tab.href}`;
    if (tab.exact) return pathname === full;
    return pathname === full || pathname.startsWith(`${full}/`);
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/40 bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={ariaLabel}
    >
      <div className="relative flex items-stretch justify-around">
        {orderedTabs[0].map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={`/${locale}${tab.href}`}
              prefetch={false}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-w-0 transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {active && <span className="absolute top-0 inset-x-[20%] h-0.5 rounded-b-full bg-primary" aria-hidden />}
              <span className="relative">
                <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-150", active && "scale-110")} />
                {(tab.badgeCount ?? 0) > 0 && (
                  <span className="absolute -end-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
                    {(tab.badgeCount ?? 0) > 9 ? "9+" : tab.badgeCount}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium leading-none truncate">{tab.label}</span>
            </Link>
          );
        })}
        {createSlot && (
          <div className="flex w-14 shrink-0 items-center justify-center" aria-hidden={false}>
            <div className="-translate-y-3">{createSlot}</div>
          </div>
        )}
        {orderedTabs[1].map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={`/${locale}${tab.href}`}
              prefetch={false}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-w-0 transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {active && <span className="absolute top-0 inset-x-[20%] h-0.5 rounded-b-full bg-primary" aria-hidden />}
              <span className="relative">
                <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-150", active && "scale-110")} />
                {(tab.badgeCount ?? 0) > 0 && (
                  <span className="absolute -end-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
                    {(tab.badgeCount ?? 0) > 9 ? "9+" : tab.badgeCount}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium leading-none truncate">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-w-0 text-muted-foreground transition-colors duration-150"
        >
          <span className="relative">
            <Menu className="h-5 w-5 shrink-0" />
            {menuBadgeCount > 0 && (
              <span className="absolute -end-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
                {menuBadgeCount > 9 ? "9+" : menuBadgeCount}
              </span>
            )}
          </span>
          <span className="text-[11px] font-medium leading-none truncate">{menuLabel}</span>
        </button>
      </div>
    </nav>
  );
}
