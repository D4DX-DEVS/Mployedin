"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { type LucideIcon, Home, Briefcase, FileText, MessageCircle, UserCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobSeekerTopNavProps {
  locale: string;
}

type NavItemKey = "home" | "jobs" | "applications" | "messages" | "profile";

const NAV_ITEMS: Array<{ labelKey: NavItemKey; href: string; icon: LucideIcon; aiPowered?: boolean }> = [
  { labelKey: "home", href: "/job-seeker", icon: Home },
  { labelKey: "jobs", href: "/job-seeker/jobs", icon: Briefcase, aiPowered: true },
  { labelKey: "applications", href: "/job-seeker/applications", icon: FileText },
  { labelKey: "messages", href: "/job-seeker/messages", icon: MessageCircle },
  { labelKey: "profile", href: "/job-seeker/profile", icon: UserCircle },
];

export function JobSeekerTopNav({ locale }: JobSeekerTopNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  function isActive(href: string) {
    const full = `/${locale}${href}`;
    if (href === "/job-seeker") return pathname === full;
    return pathname === full || pathname.startsWith(`${full}/`);
  }

  return (
    <nav className="hidden lg:flex items-center gap-1 rounded-full border border-border/70 bg-background/80 p-1">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={`/${locale}${item.href}`}
          prefetch={false}
          className={cn(
            "relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
            isActive(item.href)
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          {isActive(item.href) && (
            <motion.span
              layoutId="desktop-nav-pill"
              className="absolute inset-0 rounded-full bg-primary"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">{t(item.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

export function JobSeekerTopNavMobile({ locale }: JobSeekerTopNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  function isActive(href: string) {
    const full = `/${locale}${href}`;
    if (href === "/job-seeker") return pathname === full;
    return pathname === full || pathname.startsWith(`${full}/`);
  }

  return (
    <nav className="lg:hidden border-b border-border/40 bg-background">
      <div className="px-4 sm:px-6 overflow-x-auto">
        <div className="flex items-center gap-2 py-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={`m-${item.href}`}
              href={`/${locale}${item.href}`}
              prefetch={false}
              className={cn(
                "relative shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                isActive(item.href)
                  ? "border-primary text-primary-foreground"
                  : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive(item.href) && (
                <motion.span
                  layoutId="mobile-nav-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1">
                {item.aiPowered && <Sparkles className="h-3 w-3 opacity-80" />}
                {t(item.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

/**
 * Fixed bottom tab bar — mobile only (hidden on lg+).
 * Replaces the horizontal chip row with a native-app-style footer nav.
 */
export function JobSeekerBottomNav({ locale }: JobSeekerTopNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  function isActive(href: string) {
    const full = `/${locale}${href}`;
    if (href === "/job-seeker") return pathname === full;
    return pathname === full || pathname.startsWith(`${full}/`);
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/40 bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={`bn-${item.href}`}
              href={`/${locale}${item.href}`}
              prefetch={false}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-w-0 transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-indicator"
                  className="absolute top-0 inset-x-[20%] h-0.5 rounded-b-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative">
                <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-150", active && "scale-110")} />
                {item.aiPowered && (
                  <Sparkles className="absolute -top-1 -right-1.5 h-2.5 w-2.5 text-primary" />
                )}
              </span>
              <span className="text-[10px] font-medium leading-none truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
