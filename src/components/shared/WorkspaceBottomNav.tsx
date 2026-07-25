"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Calendar, FileText, LayoutDashboard, Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceBottomNavProps {
  locale: string;
  /** Opens the existing sidebar overlay — the "More" tab reaches everything else. */
  onOpenMenu: () => void;
  menuLabel: string;
  labels: Record<TabKey, string>;
  ariaLabel: string;
}

type TabKey = "dashboard" | "jobs" | "applications" | "interviews";

/**
 * Fixed bottom tab bar for the employer workspace on phones. The sidebar stays
 * the full navigation surface (reachable via the last tab); this only promotes
 * the four daily-driver destinations so they are one tap away instead of
 * hamburger → scroll → tap.
 */
const TABS: Array<{ key: TabKey; href: string; icon: LucideIcon }> = [
  { key: "dashboard", href: "/employer", icon: LayoutDashboard },
  { key: "jobs", href: "/employer/jobs", icon: Briefcase },
  { key: "applications", href: "/employer/applications", icon: FileText },
  { key: "interviews", href: "/employer/interviews", icon: Calendar },
];

export function WorkspaceBottomNav({ locale, onOpenMenu, menuLabel, labels, ariaLabel }: WorkspaceBottomNavProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    const full = `/${locale}${href}`;
    if (href === "/employer") return pathname === full;
    return pathname === full || pathname.startsWith(`${full}/`);
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/40 bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={ariaLabel}
    >
      <div className="flex items-stretch justify-around">
        {TABS.map(({ key, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={`/${locale}${href}`}
              prefetch={false}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-w-0 transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {active && <span className="absolute top-0 inset-x-[20%] h-0.5 rounded-b-full bg-primary" aria-hidden />}
              <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-150", active && "scale-110")} />
              <span className="text-[10px] font-medium leading-none truncate">{labels[key]}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-w-0 text-muted-foreground transition-colors duration-150"
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span className="text-[10px] font-medium leading-none truncate">{menuLabel}</span>
        </button>
      </div>
    </nav>
  );
}
