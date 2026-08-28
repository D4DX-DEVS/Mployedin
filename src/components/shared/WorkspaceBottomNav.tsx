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
}

interface WorkspaceBottomNavProps {
  locale: string;
  tabs: BottomNavTab[];
  /** Opens the existing sidebar overlay — the "More" tab reaches everything else. */
  onOpenMenu: () => void;
  menuLabel: string;
  ariaLabel: string;
}

/**
 * Fixed bottom tab bar for workspace roles (employer, admin, agent,
 * super_agent) on phones. The sidebar stays the full navigation surface
 * (reachable via the last tab); this only promotes each role's daily-driver
 * destinations so they are one tap away instead of hamburger → scroll → tap.
 */
export function WorkspaceBottomNav({ locale, tabs, onOpenMenu, menuLabel, ariaLabel }: WorkspaceBottomNavProps) {
  const pathname = usePathname();

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
      <div className="flex items-stretch justify-around">
        {tabs.map((tab) => {
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
              <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-150", active && "scale-110")} />
              <span className="text-[11px] font-medium leading-none truncate">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-w-0 text-muted-foreground transition-colors duration-150"
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span className="text-[11px] font-medium leading-none truncate">{menuLabel}</span>
        </button>
      </div>
    </nav>
  );
}
