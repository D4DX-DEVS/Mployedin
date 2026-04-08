"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface JobSeekerTopNavProps {
  locale: string;
}

const NAV_ITEMS = [
  { label: "Home", href: "/job-seeker" },
  { label: "Jobs", href: "/job-seeker/jobs" },
  { label: "Applications", href: "/job-seeker/applications" },
  { label: "Messages", href: "/job-seeker/messages" },
  { label: "Profile", href: "/job-seeker/profile" },
];

export function JobSeekerTopNav({ locale }: JobSeekerTopNavProps) {
  const pathname = usePathname();

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
          <span className="relative z-10">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function JobSeekerTopNavMobile({ locale }: JobSeekerTopNavProps) {
  const pathname = usePathname();

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
              <span className="relative z-10">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
