"use client";

import { usePathname } from "next/navigation";
import { Menu, type LucideProps } from "lucide-react";
import type { FC } from "react";
import { cn } from "@/lib/utils";
import { BottomNavItem, BOTTOM_BAR_CLASS, BOTTOM_BAR_STYLE } from "@/components/shared/BottomNavItem";

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

  function renderTab(tab: BottomNavTab) {
    return (
      <BottomNavItem
        key={tab.href}
        href={`/${locale}${tab.href}`}
        label={tab.label}
        icon={tab.icon}
        active={isActive(tab)}
        indicatorId="workspace-bottom-nav-indicator"
        badgeCount={tab.badgeCount}
      />
    );
  }

  return (
    <nav
      // CookieConsent measures this bar and sits on top of it.
      data-bottom-nav=""
      className={cn(BOTTOM_BAR_CLASS, "z-40")}
      style={BOTTOM_BAR_STYLE}
      aria-label={ariaLabel}
    >
      <div className="relative flex items-stretch justify-around px-1">
        {orderedTabs[0].map(renderTab)}
        {createSlot && (
          <div className="flex w-16 shrink-0 items-start justify-center">
            <div className="-translate-y-4">{createSlot}</div>
          </div>
        )}
        {orderedTabs[1].map(renderTab)}
        <BottomNavItem
          onClick={onOpenMenu}
          label={menuLabel}
          icon={Menu}
          indicatorId="workspace-bottom-nav-indicator"
          badgeCount={menuBadgeCount}
        />
      </div>
    </nav>
  );
}
