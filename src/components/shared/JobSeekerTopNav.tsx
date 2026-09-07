"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/nav/iconRegistry";
import type { NavBadgeKey, NavGroup, NavItem } from "@/lib/nav/menuConfig";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// useLayoutEffect logs a warning during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Job-board style shell navigation for the seeker (the Naukri / Indeed
 * pattern): every seeker destination as a header tab on desktop, a fixed tab
 * bar on phones, and what the phone bar cannot fit one tap away behind "More".
 *
 * Nothing is hand-listed here. Labels, hrefs, icons and badge keys all come
 * from the seeker block of `menuConfig` — the same source the ⌘K menu and the
 * route-coverage test read — so a route added there shows up here without a
 * second edit, and the three menus cannot drift apart again.
 */

/**
 * Primary destinations, in tab order — on desktop this is the whole nav.
 *
 * Profile used to sit here and Job Alerts / Companies / Settings hid behind a
 * "More" dropdown. That put Profile and Settings on screen twice: the header
 * avatar menu already opens both, so the same two destinations had two
 * different entry points a few pixels apart. Profile and Settings now belong to
 * the avatar menu alone, and the two destinations that had no other home were
 * promoted to tabs — which empties "More" and removes it.
 */
const PRIMARY_PATHS = [
  "/job-seeker",
  "/job-seeker/jobs",
  "/job-seeker/applications",
  "/job-seeker/messages",
  "/job-seeker/companies",
  "/job-seeker/saved-searches",
] as const;

/**
 * The phone tab bar is about finding work, not about the account.
 *
 * It mirrored the desktop tabs, so two of its five slots went to Messages and
 * Profile — the two things a seeker opens least while job hunting — and saved
 * jobs, which is where they park everything they mean to come back to, was
 * three taps away behind "More". Profile and Messages move into the sheet;
 * both are also one tap from the header avatar and inbox.
 */
const MOBILE_PATHS = [
  "/job-seeker",
  "/job-seeker/jobs",
  "/job-seeker/applications",
] as const;

/**
 * What "More" is allowed to hold on desktop: nothing.
 *
 * It had grown to eighteen entries across four headed groups — a second
 * navigation system listing every route the product has. The entries that left
 * are not gone: the application lifecycle (interviews, offers, onboarding)
 * hangs off Applications, everything that makes up the seeker's profile hangs
 * off Profile, Profile and Settings hang off the header avatar, and the last
 * two — Job Alerts and Companies — are tabs. Every seeker route now has exactly
 * one entry point, so the trigger renders only if this list regains an entry.
 */
const MORE_PATHS = [] as const;

/**
 * The phone sheet is a different problem: its tab bar has three slots, so it
 * still needs somewhere to put what the bar gave up. Profile and Settings are
 * not here either — the header avatar is on screen at every width, and listing
 * them twice made the sheet read as a second account menu.
 */
const MOBILE_MORE_PATHS = [
  "/job-seeker/messages",
  "/job-seeker/saved-searches",
  "/job-seeker/companies",
] as const;

/**
 * Live counts still badge the primary tabs, where the destination is on screen.
 * They no longer roll up onto "More" or repeat inside it: the header already
 * carries the notification bell and the inbox indicator, so a menu that also
 * counted them showed the same number in three places at once.
 */
export type NavCounts = Partial<Record<NavBadgeKey, number>>;

interface JobSeekerNavProps {
  locale: string;
  navGroups: NavGroup[];
  counts?: NavCounts;
}

interface SplitNav {
  primary: NavItem[];
  rest: NavGroup[];
}

function stripLocale(href: string, locale: string) {
  const prefix = `/${locale}`;
  return href.startsWith(prefix) ? href.slice(prefix.length) || "/" : href;
}

function findByPath(navGroups: NavGroup[], locale: string, path: string): NavItem | undefined {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (stripLocale(item.href, locale) === path) return item;
    }
  }
  return undefined;
}

/**
 * Pull the primary tabs out of the config and keep everything else in its
 * original group order so "More" reads the same way the ⌘K menu does.
 */
export function splitSeekerNav(
  navGroups: NavGroup[],
  locale: string,
  primaryPaths: readonly string[] = PRIMARY_PATHS,
  morePaths: readonly string[] = MORE_PATHS
): SplitNav {
  const primary = primaryPaths
    .map((path) => findByPath(navGroups, locale, path))
    .filter((item): item is NavItem => Boolean(item));
  const promoted = new Set(primary.map((item) => item.href));
  const allowed = new Set(morePaths.map((path) => `/${locale}${path}`));
  const rest = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !promoted.has(item.href) && allowed.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
  return { primary, rest };
}

function useIsActive(locale: string) {
  const pathname = usePathname();
  const root = `/${locale}/job-seeker`;
  return (href: string) => {
    if (href === root) return pathname === root;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
}

function labelFor(item: NavItem | NavGroup, locale: string) {
  if ("title" in item) return locale === "ar" ? item.titleAr : item.title;
  return locale === "ar" ? item.labelAr ?? item.label : item.label;
}

function countFor(item: NavItem, counts?: NavCounts) {
  return item.badgeKey ? counts?.[item.badgeKey] ?? 0 : 0;
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-[18px] text-destructive-foreground",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/* ─────────────────────────────── Desktop ─────────────────────────────── */

export function JobSeekerTopNav({ locale, navGroups, counts }: JobSeekerNavProps) {
  const t = useTranslations("nav");
  const isActive = useIsActive(locale);
  const { primary, rest } = splitSeekerNav(navGroups, locale);
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const activeIndex = primary.findIndex((item) => isActive(item.href));
  const moreActive = activeIndex < 0 && rest.some((group) => group.items.some((item) => isActive(item.href)));

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

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (observer && navRef.current) observer.observe(navRef.current);
    itemRefs.current.forEach((el) => el && observer?.observe(el));
    window.addEventListener("resize", measure);
    // Web fonts can change item widths after first paint — re-measure once ready.
    document.fonts?.ready?.then(measure).catch(() => {});

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex, locale]);

  return (
    <nav
      ref={navRef}
      aria-label={t("jobSeekerNavigation")}
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
      {primary.map((item, i) => {
        const active = isActive(item.href);
        const count = countFor(item, counts);
        return (
          <Link
            key={item.href}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            href={item.href}
            aria-current={active ? "page" : undefined}
            prefetch={false}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <span className="relative z-10">{labelFor(item, locale)}</span>
            <CountBadge count={count} className={active ? "bg-primary-foreground text-primary" : undefined} />
          </Link>
        );
      })}
      {rest.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "relative z-10 inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
              moreActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            {t("more")}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 max-h-[75vh] overflow-y-auto p-1.5">
            {rest.map((group, groupIndex) => (
              <div key={group.label ?? groupIndex}>
                {groupIndex > 0 && <DropdownMenuSeparator />}
                {group.label && (
                  <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {labelFor(group, locale)}
                  </DropdownMenuLabel>
                )}
                {group.items.map((item) => {
                  const Icon = getIcon(item.icon);
                  const active = isActive(item.href);
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        prefetch={false}
                        aria-current={active ? "page" : undefined}
                        className={cn("flex items-center gap-2.5", active && "bg-primary/10 text-primary")}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{labelFor(item, locale)}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}

/* ─────────────────────────────── Mobile ─────────────────────────────── */

/**
 * Fixed bottom tab bar — phones only (hidden on lg+). Native-app-style footer
 * nav; "More" opens a grouped sheet with every other destination.
 */
export function JobSeekerBottomNav({ locale, navGroups, counts }: JobSeekerNavProps) {
  const t = useTranslations("nav");
  const isActive = useIsActive(locale);
  const { primary, rest } = splitSeekerNav(navGroups, locale, MOBILE_PATHS, MOBILE_MORE_PATHS);
  const [moreOpen, setMoreOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const moreActive = rest.some((group) => group.items.some((item) => isActive(item.href)));

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
              {rest.map((group, groupIndex) => (
                <div key={group.label ?? groupIndex}>
                  {group.label && (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {labelFor(group, locale)}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const Icon = getIcon(item.icon);
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch={false}
                          onClick={() => setMoreOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium",
                            active ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card text-foreground"
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="flex-1 truncate">{labelFor(item, locale)}</span>
                        </Link>
                      );
                    })}
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
          {primary.map((item) => {
            const active = isActive(item.href);
            const Icon = getIcon(item.icon);
            const count = countFor(item, counts);
            return (
              <Link
                key={`bn-${item.href}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
                prefetch={false}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors duration-150",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="job-seeker-bottom-nav-indicator"
                    className="absolute inset-x-[20%] top-0 h-0.5 rounded-b-full bg-primary"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative">
                  <Icon className={cn("h-5 w-5 shrink-0 transition-transform duration-150", active && "scale-110")} />
                  <CountBadge count={count} className="absolute -right-2.5 -top-1.5" />
                </span>
                <span className="max-w-full truncate text-[11px] font-medium leading-none">{labelFor(item, locale)}</span>
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
