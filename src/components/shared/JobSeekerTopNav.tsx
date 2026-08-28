"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type LucideIcon,
  Home,
  Briefcase,
  FileText,
  Headset,
  UserCircle,
  Sparkles,
  MoreHorizontal,
  CalendarDays,
  Gift,
  X,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

// useLayoutEffect logs a warning during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface JobSeekerTopNavProps {
  locale: string;
}

type NavItemKey = "home" | "jobs" | "applications" | "support" | "profile";

const NAV_ITEMS: Array<{ labelKey: NavItemKey; href: string; icon: LucideIcon; aiPowered?: boolean }> = [
  { labelKey: "home", href: "/job-seeker", icon: Home },
  { labelKey: "jobs", href: "/job-seeker/jobs", icon: Briefcase, aiPowered: true },
  { labelKey: "applications", href: "/job-seeker/applications", icon: FileText },
  { labelKey: "support", href: "/job-seeker/messages", icon: Headset },
  { labelKey: "profile", href: "/job-seeker/profile", icon: UserCircle },
];

export function JobSeekerTopNav({ locale }: JobSeekerTopNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  function isActive(href: string) {
    const full = `/${locale}${href}`;
    if (href === "/job-seeker") return pathname === full;
    return pathname === full || pathname.startsWith(`${full}/`);
  }

  const activeIndex = NAV_ITEMS.findIndex((item) => isActive(item.href));

  // Position the highlight from the active item's live geometry instead of a
  // Framer shared-layout snapshot (which goes stale after idle/resize/route
  // changes and causes the pill to fly in from a wrong origin).
  useIsomorphicLayoutEffect(() => {
    function measure() {
      const el = activeIndex >= 0 ? itemRefs.current[activeIndex] : null;
      if (!el) {
        setPill(null);
        return;
      }
      setPill({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    }

    measure();

    const observer = new ResizeObserver(measure);
    if (navRef.current) observer.observe(navRef.current);
    itemRefs.current.forEach((el) => el && observer.observe(el));
    window.addEventListener("resize", measure);
    // Web fonts can change item widths after first paint — re-measure once ready.
    document.fonts?.ready?.then(measure).catch(() => {});

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex, locale]);

  return (
    <nav
      ref={navRef}
      className="relative hidden lg:flex items-center gap-1 rounded-full border border-border/70 bg-background/80 p-1"
    >
      {pill && (
        <motion.span
          aria-hidden
          className="absolute z-0 rounded-full bg-primary"
          initial={false}
          animate={{ left: pill.left, top: pill.top, width: pill.width, height: pill.height }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      {NAV_ITEMS.map((item, i) => (
        <Link
          key={item.href}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          href={`/${locale}${item.href}`}
          aria-current={isActive(item.href) ? "page" : undefined}
          prefetch={false}
          className={cn(
            "relative z-10 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
            isActive(item.href)
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
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
              aria-current={isActive(item.href) ? "page" : undefined}
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
                  initial={false}
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
  const [moreOpen, setMoreOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const bottomItems = NAV_ITEMS.filter((item) => item.labelKey !== "support");
  const moreGroups = [
    {
      label: locale === "ar" ? "الخطوات التالية" : "Next steps",
      items: [
        { label: t("interviews"), href: "/job-seeker/interviews", icon: CalendarDays },
        { label: t("offers"), href: "/job-seeker/offers", icon: FileText },
        { label: t("calendar"), href: "/job-seeker/calendar", icon: CalendarDays },
      ],
    },
    {
      label: locale === "ar" ? "أدوات المسيرة المهنية" : "Career tools",
      items: [
        { label: t("savedSearches"), href: "/job-seeker/saved-searches", icon: Bell },
        { label: t("cvBuilder"), href: "/job-seeker/cv", icon: FileText },
        { label: t("documents"), href: "/job-seeker/documents", icon: FileText },
      ],
    },
    {
      label: locale === "ar" ? "النمو" : "Growth",
      items: [
        { label: t("referralProgram"), href: "/job-seeker/referral", icon: Gift },
      ],
    },
    {
      label: locale === "ar" ? "المساعدة" : "Help",
      items: [
        { label: t("support"), href: "/job-seeker/messages", icon: Headset },
      ],
    },
  ];
  const moreItems = moreGroups.flatMap((group) => group.items);

  function isActive(href: string) {
    const full = `/${locale}${href}`;
    if (href === "/job-seeker") return pathname === full;
    return pathname === full || pathname.startsWith(`${full}/`);
  }

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const moreActive = moreItems.some((item) => isActive(item.href));

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <section
            id="job-seeker-more-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-seeker-more-title"
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto rounded-t-3xl border-t border-border bg-background p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="job-seeker-more-title" className="heading-section font-semibold">{t("more")}</h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label={t("a11yCloseMenu")}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              {moreGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map(({ label, href, icon: Icon }) => (
                      <Link
                        key={href}
                        href={`/${locale}${href}`}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          "flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium",
                          isActive(href)
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      <nav
        aria-label={t("jobSeekerMobileNavigation")}
        className="fixed inset-x-0 bottom-0 z-[90] border-t border-border/40 bg-background/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex min-h-16 items-stretch justify-around">
          {bottomItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={`bn-${item.href}`}
                href={`/${locale}${item.href}`}
                aria-current={active ? "page" : undefined}
                prefetch={false}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors duration-150",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute inset-x-[20%] top-0 h-0.5 rounded-b-full bg-primary"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative">
                  <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-150", active && "scale-110")} />
                  {item.aiPowered && (
                    <Sparkles className="absolute -right-1.5 -top-1 h-2.5 w-2.5 text-primary" />
                  )}
                </span>
                <span className="max-w-full truncate text-[11px] font-medium leading-none">{t(item.labelKey)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-controls="job-seeker-more-menu"
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium",
              moreActive || moreOpen ? "text-primary" : "text-muted-foreground"
            )}
          >
            {(moreActive || moreOpen) && <span aria-hidden className="absolute inset-x-[20%] top-0 h-0.5 rounded-b-full bg-primary" />}
            <MoreHorizontal className="h-5 w-5" />
            <span>{t("more")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
