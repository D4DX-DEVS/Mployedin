"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup, NavItem } from "@/lib/nav/menuConfig";
import { withoutBottomTabItems } from "@/lib/nav/bottomNavTabs";
import { getIcon } from "@/lib/nav/iconRegistry";
import { useUnreadMessageCount } from "@/hooks/useConversations";
import { useAdminActionCounts } from "@/hooks/useAdminActionCounts";
import { useJobSeekerActionCounts } from "@/hooks/useJobSeekerActionCounts";
import { useSuperAgentActionCounts } from "@/hooks/useSuperAgentActionCounts";
import { useAgentActionCounts } from "@/hooks/useAgentActionCounts";

interface SidebarProps {
  navGroups: NavGroup[];
  locale: string;
  userRole?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  companyLogo?: string;
}

export function Sidebar({
  navGroups,
  locale,
  userRole,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const t = useTranslations("nav");
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const effectiveRole = userRole ?? sessionRole;
  const isRtl = locale === "ar";
  const unreadMessageCount = useUnreadMessageCount();
  // Only a seeker has offers or interview invites waiting on them, so the
  // endpoint is not called for anyone else.
  const seekerCounts = useJobSeekerActionCounts(effectiveRole === "job_seeker");
  const adminCounts = useAdminActionCounts(effectiveRole === "admin");
  const superAgentCounts = useSuperAgentActionCounts(effectiveRole === "super_agent");
  const agentCounts = useAgentActionCounts(effectiveRole === "agent");
  /**
   * Badge count for a nav entry. This used to be `item.title === "Messages"`,
   * which meant a renamed entry silently lost its badge and no second counter
   * could ever be added — the reason pending offers and unanswered interview
   * invites were invisible in navigation.
   */
  const ownBadgeCount = (item: NavItem): number => {
    switch (item.badgeKey) {
      case "unreadMessages":
        return unreadMessageCount;
      case "pendingOffers":
        return seekerCounts.pendingOffers;
      case "interviewsAwaitingResponse":
        return seekerCounts.interviewsAwaitingResponse;
      case "openSupportTickets":
        return adminCounts.openSupportTickets;
      case "unreadContactSubmissions":
        return adminCounts.unreadContactSubmissions;
      case "pendingExhibitionReviews":
        return superAgentCounts.pendingExhibitionReviews;
      case "pendingCommissionApprovals":
        return superAgentCounts.pendingCommissionApprovals;
      case "overdueTasks":
        return agentCounts.overdueTasks;
      case "dueFollowUps":
        return agentCounts.dueFollowUps;
      default:
        // Legacy entries carry no badgeKey; keep the original title match so
        // employer/admin Messages badges survive until they declare one.
        return item.title === "Messages" ? unreadMessageCount : 0;
    }
  };

  /**
   * A group carries what it hides.
   *
   * The rail renders top-level entries only. Grouping admin's eleven entries
   * into five primaries plus "More Admin Tools" pushed every badged destination
   * a level down, so an assigned support ticket had a badge that nothing on
   * screen ever displayed. Summing children means a collapsed group still says
   * "something in here needs you", and opening it shows which child.
   */
  const badgeCount = (item: NavItem): number => {
    const own = ownBadgeCount(item);
    if (!item.children?.length) return own;
    return item.children.reduce((sum, child) => sum + badgeCount(child), own);
  };
  const usesSimpleEmployerMenu = effectiveRole === "employer";
  const isAdminWorkspace = effectiveRole === "admin";
  const usesModernWorkspaceShell = effectiveRole === "admin" || effectiveRole === "employer" || effectiveRole === "agent" || effectiveRole === "super_agent";
  const usesDualTierLayout = effectiveRole === "admin" || effectiveRole === "employer" || effectiveRole === "agent" || effectiveRole === "super_agent";
  const usesInlineWorkspaceSidebar = usesModernWorkspaceShell && !usesDualTierLayout;
  const usesLightWorkspaceSidebar = false;
  const mobileSidebarRef = useRef<HTMLElement | null>(null);
  const desktopSidebarRef = useRef<HTMLElement | null>(null);

  const allMainItems = navGroups.flatMap((group) => group.items);
  /**
   * The group heading each top-level item belongs to.
   *
   * `navGroups` is flattened for rendering, which silently discarded
   * `NavGroup.label` — a menu authored as four task groups ("Find work",
   * "Track progress", …) rendered as one flat scroll list. This keeps the
   * heading addressable by item so a flat list can still print its dividers.
   */
  const groupLabelByItemHref = new Map<string, string>();
  for (const group of navGroups) {
    const label = locale === "ar" ? group.labelAr : group.label;
    if (!label) continue;
    for (const item of group.items) groupLabelByItemHref.set(item.href, label);
  }

  const rootItem = (title: string) =>
    allMainItems.find((item) => item.title === title);
  const standaloneAsChild = (title: string, group?: string, groupAr?: string) => {
    const item = rootItem(title);
    return item ? { ...item, group, groupAr } : undefined;
  };
  const compactChildren = (
    items: Array<NavItem | undefined>,
    group?: string,
    groupAr?: string
  ) =>
    items
      .filter((item): item is NavItem => Boolean(item))
      .map((item) => ({ ...item, group: item.group ?? group, groupAr: item.groupAr ?? groupAr }));

  const adminPrimaryTitles = ["Dashboard", "Recruitment", "People", "Finance", "CMS / Content"];
  const adminMoreChildren = allMainItems
    .filter((item) => !adminPrimaryTitles.includes(item.title))
    .map((item) => ({ ...item, group: undefined, groupAr: undefined }));
  const adminGroupedItems: NavItem[] = [
    ...adminPrimaryTitles.map(rootItem).filter((item): item is NavItem => Boolean(item)),
    {
      title: "More Admin Tools",
      titleAr: "المزيد من أدوات الإدارة",
      href: adminMoreChildren[0]?.href ?? `/${locale}/admin/reports`,
      icon: "Grid3x3",
      description: "Reports, platform data, system, exhibitions and communication",
      descriptionAr: "التقارير وبيانات المنصة والنظام والمعارض والتواصل",
      children: adminMoreChildren,
    },
  ];

  // The agent drawer used to be re-grouped here by hand — Hiring, Accounts,
  // Tasks, Messages, More — because the real nav was two parents and a
  // twelve-child "Tools" junk drawer that no phone could present. menuConfig
  // now groups the agent workspace properly (Pipeline / Earnings / Performance
  // plus top-level Tasks and Calendar), so the drawer renders the same tree as
  // the desktop rail. Re-deriving it here would only be able to go stale again.

  const superOverview = rootItem("Overview")?.children ?? [];
  const findSuperOverview = (title: string) =>
    superOverview.find((item) => item.title === title);
  const superAgentMobileItems: NavItem[] = [
    rootItem("Dashboard"),
    rootItem("Team"),
    {
      title: "Hiring",
      titleAr: "التوظيف",
      href: `/${locale}/super-agent/jobs`,
      icon: "Briefcase",
      description: "Team hiring pipeline",
      descriptionAr: "مسار توظيف الفريق",
      children: compactChildren(
        ["Jobs", "Applications", "Interviews", "Placements"].map(findSuperOverview)
      ),
    },
    {
      title: "Performance",
      titleAr: "الأداء",
      href: `/${locale}/super-agent/reports`,
      icon: "BarChart2",
      description: "Team performance, finance and insights",
      descriptionAr: "أداء الفريق والمالية والرؤى",
      children: [
        ...compactChildren(
          ["Reports", "Targets", "Target Report", "Territory"].map(findSuperOverview),
          "Performance",
          "الأداء"
        ),
        ...compactChildren(
          ["Commissions", "Commission Report", "Invoices"].map(findSuperOverview),
          "Finance",
          "المالية"
        ),
        ...compactChildren(
          ["Market", "Insights"].map(findSuperOverview),
          "Insights",
          "الرؤى"
        ),
      ],
    },
    rootItem("Messages"),
    {
      title: "More",
      titleAr: "المزيد",
      href: `/${locale}/super-agent/exhibitions`,
      icon: "Grid3x3",
      description: "Exhibitions and resources",
      descriptionAr: "المعارض والموارد",
      children: compactChildren([
        standaloneAsChild("Exhibition Requests"),
        standaloneAsChild("Exhibition Analytics"),
        standaloneAsChild("Resource Downloads"),
      ]),
    },
  ].filter((item): item is NavItem => Boolean(item));

  /* Admin carries eleven top-level entries and fifty-two children — by far the
     heaviest workspace in the product. The five-primary grouping below was
     written for the phone drawer and never applied to the desktop rail, so the
     wider viewport kept the flat list the narrow one had already rejected.
     Same grouping, both breakpoints: Dashboard, Recruitment, People, Finance,
     CMS, and everything else behind "More Admin Tools". */
  const navigationMainItems = mobileOpen
    ? withoutBottomTabItems(
        effectiveRole === "admin"
          ? adminGroupedItems
          : effectiveRole === "super_agent"
            ? superAgentMobileItems
            : allMainItems,
        effectiveRole,
        locale
      )
    : effectiveRole === "admin"
      ? adminGroupedItems
      : allMainItems;

  const getInitialActiveItem = () => {
    for (const item of allMainItems) {
      if (item.children?.some((child) => pathname === child.href)) return item.title;
    }

    for (const item of allMainItems) {
      if (pathname === item.href) return item.title;
    }

    for (const item of allMainItems) {
      if (item.children?.some((child) => pathname.startsWith(child.href + "/"))) return item.title;
    }

    // Longest prefix wins. Scanning in array order made the workspace root
    // (always first, and a prefix of every route under it) match before the
    // real section, so every detail page like /job-seeker/jobs/123 lit up
    // "Home" and dimmed "Jobs".
    const prefixMatch = allMainItems
      .filter((item) => pathname.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0];
    if (prefixMatch) return prefixMatch.title;

    return allMainItems[0]?.title || "";
  };

  const [activeMainTitle, setActiveMainTitle] = useState<string>(getInitialActiveItem());
  // The dual-tier secondary panel overlays the workspace (lg:absolute), so it
  // must never start pinned open on a deep link — it sat over the destination
  // page and intercepted clicks on the content beneath (QA SA-BUG-01). It now
  // opens only when the user clicks a main nav item. Inline layouts keep it
  // expanded as before.
  const [submenuExpanded, setSubmenuExpanded] = useState(() => !usesDualTierLayout);
  const [activeMobileNestedItem, setActiveMobileNestedItem] = useState<NavItem | null>(null);

  useEffect(() => {
    const current = getInitialActiveItem();
    if (current) setActiveMainTitle(current);
  }, [pathname, navGroups]);

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    // A desktop secondary tier can remain expanded while the viewport changes.
    // Mobile navigation should always open at the root so users are not dropped
    // into a stale submenu with no context.
    if (mobileOpen && usesDualTierLayout) {
      setSubmenuExpanded(false);
      setActiveMobileNestedItem(null);
    }
  }, [mobileOpen, usesDualTierLayout]);

  useEffect(() => {
    if (!mobileOpen || !mobileSidebarRef.current) return;

    const sidebarElement = mobileSidebarRef.current;
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const getFocusableElements = () => Array.from(sidebarElement.querySelectorAll<HTMLElement>(focusableSelector));

    const initialFocusable = getFocusableElements()[0];
    (initialFocusable ?? sidebarElement).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onMobileClose?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        sidebarElement.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, onMobileClose]);

  useEffect(() => {
    // Inline layouts auto-expand their children when the active group changes.
    // Dual-tier keeps the active child group visible on desktop.
    if (!usesDualTierLayout) setSubmenuExpanded(true);
  }, [activeMainTitle, usesDualTierLayout]);

  useEffect(() => {
    if (!usesDualTierLayout || !submenuExpanded || mobileOpen) return;

    const closeSubmenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSubmenuExpanded(false);
    };

    // Clicking anywhere in the page dismisses the flyout, like every other
    // popover — previously only Escape or the X button closed it.
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !desktopSidebarRef.current?.contains(target)) {
        setSubmenuExpanded(false);
      }
    };

    document.addEventListener("keydown", closeSubmenu);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeSubmenu);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [mobileOpen, submenuExpanded, usesDualTierLayout]);

  const compactRootTitles = navigationMainItems.map((item) => item.title);
  const resolvedActiveMainTitle =
    mobileOpen && effectiveRole === "admin" && !compactRootTitles.includes(activeMainTitle)
      ? "More Admin Tools"
      : mobileOpen && effectiveRole === "super_agent" && !compactRootTitles.includes(activeMainTitle)
          ? superAgentMobileItems.find((item) =>
              item.children?.some((child) =>
                pathname === child.href || pathname.startsWith(`${child.href}/`)
              )
            )?.title ?? activeMainTitle
          : activeMainTitle;
  const activeMainItem = navigationMainItems.find((item) => item.title === resolvedActiveMainTitle);
  const hasSubmenu = Boolean(activeMainItem?.children?.length);
  const submenuId = activeMainItem
    ? `sidebar-submenu-${activeMainItem.title.toLowerCase().replace(/\s+/g, "-")}`
    : undefined;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function isActiveChildItem(childHref: string, siblingHrefs: string[]) {
    if (pathname === childHref) {
      return true;
    }

    if (!pathname.startsWith(childHref + "/")) {
      return false;
    }

    return !siblingHrefs.some((href) => {
      if (href === childHref) {
        return false;
      }

      return pathname === href || pathname.startsWith(href + "/");
    });
  }

  function renderSubmenuLink(child: NavItem, variant: "inline" | "panel", siblingHrefs: string[]) {
    const ChildIcon = getIcon(child.icon);
    const isChildActive = isActiveChildItem(child.href, siblingHrefs);
    const focusRingClass = usesLightWorkspaceSidebar
      ? "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
      : "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35";
    const inlineLinkClass = usesLightWorkspaceSidebar
      ? isChildActive
        ? "border-sky-100 bg-[linear-gradient(135deg,_rgba(14,165,233,0.14),_rgba(255,255,255,0.96))] text-slate-950 font-semibold shadow-[0_22px_42px_-32px_rgba(2,132,199,0.65)]"
        : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900 hover:shadow-[0_18px_36px_-34px_rgba(15,23,42,0.5)] font-medium"
      : isChildActive
        ? "border-border bg-card/92 text-foreground font-semibold shadow-[0_22px_42px_-32px_rgba(2,132,199,0.35)]"
        : "border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground hover:shadow-[0_18px_36px_-34px_rgba(15,23,42,0.24)] font-medium";
    const inlineIconClass = usesLightWorkspaceSidebar
      ? isChildActive
        ? "text-sky-600"
        : "text-slate-400 group-hover:text-sky-600"
      : isChildActive
        ? "text-primary"
        : "text-muted-foreground group-hover:text-primary";

    if (mobileOpen && variant === "panel" && child.children?.length) {
      return (
        <button
          key={child.title}
          type="button"
          onClick={() => setActiveMobileNestedItem(child)}
          className={cn(
            "group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium text-muted-foreground transition-all hover:bg-card/80 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
            isRtl ? "text-right" : "text-left"
          )}
        >
          <ChildIcon className="h-[18px] w-[18px] shrink-0 text-muted-foreground group-hover:text-primary" />
          <span className="min-w-0 flex-1 break-words leading-5 line-clamp-2">
            {locale === "ar" ? child.titleAr : child.title}
          </span>
          {badgeCount(child) > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
              {badgeCount(child) > 99 ? "99+" : badgeCount(child)}
            </span>
          )}
          {isRtl
            ? <ChevronLeft className="h-4 w-4 shrink-0" />
            : <ChevronRight className="h-4 w-4 shrink-0" />}
        </button>
      );
    }

    return (
      <Link
        key={child.href}
        href={child.href}
        aria-current={isChildActive ? "page" : undefined}
        prefetch={false}
        onClick={() => {
          // Close the flyout after navigating — leaving it open kept the
          // overlay sitting on top of the destination page's content.
          if (usesDualTierLayout) setSubmenuExpanded(false);
          onMobileClose?.();
        }}
        title={locale === "ar" ? child.titleAr : child.title}
        className={cn(
          "flex transition-all duration-200 group relative overflow-hidden",
          variant === "panel" ? "items-start gap-3" : "items-center gap-3",
          focusRingClass,
          variant === "inline"
            ? cn(
                "rounded-2xl border px-3 py-2.5",
                inlineLinkClass
              )
            : cn(
                "min-h-12 rounded-xl px-3 py-3 text-[13px]",
                isChildActive
                  ? usesDualTierLayout
                      ? "bg-primary/10 text-primary font-semibold shadow-[0_8px_20px_-12px_rgba(2,132,199,0.28)] ring-1 ring-primary/15"
                      : "bg-card text-primary font-bold shadow-sm ring-1 ring-border/50"
                  : usesDualTierLayout
                    ? "text-muted-foreground hover:bg-card/80 hover:text-foreground font-medium hover:shadow-[0_8px_16px_-12px_rgba(15,23,42,0.12)]"
                    : "text-sidebar-fg/70 hover:bg-card hover:text-sidebar-fg font-medium hover:shadow-sm hover:ring-1 hover:ring-border/50"
              )
        )}
      >
        {isChildActive && (
          <div
            className={cn(
              "absolute top-1/2 h-1/2 w-1 -translate-y-1/2",
              isRtl ? "right-0 rounded-l-full" : "left-0 rounded-r-full",
              variant === "inline"
                ? usesLightWorkspaceSidebar
                  ? "bg-sky-500"
                  : "bg-primary"
                : "bg-primary"
            )}
          />
        )}
        <ChildIcon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-colors",
            variant === "panel" ? "mt-0.5" : "",
            variant === "inline"
              ? inlineIconClass
              : isChildActive
                ? "text-primary"
                : "text-muted-foreground group-hover:text-brand-blue"
          )}
        />
        {variant === "panel" ? (
          <span
            className={cn(
              "min-w-0 flex-1 break-words text-[13px] leading-5 line-clamp-2",
              isRtl ? "text-right" : "text-left"
            )}
          >
            {locale === "ar" ? child.titleAr : child.title}
          </span>
        ) : (
          <span
            className={cn(
              "min-w-0 flex-1 break-words leading-5 line-clamp-2",
              isRtl ? "text-right" : "text-left"
            )}
          >
            {locale === "ar" ? child.titleAr : child.title}
          </span>
        )}
        {/* A group's badge is a sum of its children (see badgeCount); if the
            panel that opens does not repeat the count on the child that owns
            it, the trail dies here and the user cannot find what was flagged. */}
        {badgeCount(child) > 0 && (
          <span className="ms-auto flex h-5 min-w-5 shrink-0 items-center justify-center self-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {badgeCount(child) > 99 ? "99+" : badgeCount(child)}
          </span>
        )}
      </Link>
    );
  }

  const sidebarBorder = isRtl ? "border-l" : "border-r";

  const primarySidebar = (
    <div
      data-sidebar-tone={usesLightWorkspaceSidebar ? "light" : "theme-aware"}
      className={cn(
        "h-full flex flex-col z-20 shrink-0",
        usesDualTierLayout
          ? `w-[280px] max-w-[88vw] lg:w-[224px] ${sidebarBorder} border-border/80 bg-[radial-gradient(circle_at_top_left,_hsl(var(--brand-cyan)/0.22),_transparent_60%),linear-gradient(180deg,_hsl(var(--card)/0.98),_hsl(var(--surface-3)/0.94))] shadow-[0_28px_80px_-52px_rgba(2,132,199,0.32)] backdrop-blur-xl`
          : usesModernWorkspaceShell
          ? usesSimpleEmployerMenu
            ? `w-[196px] ${sidebarBorder} border-border/80 bg-[radial-gradient(circle_at_top_left,_hsl(var(--brand-cyan)/0.14),_transparent_50%),linear-gradient(180deg,_hsl(var(--card)/0.97),_hsl(var(--surface-3)/0.92))] shadow-[0_24px_64px_-52px_rgba(2,132,199,0.24)] backdrop-blur-xl`
            : usesLightWorkspaceSidebar
            ? `w-[216px] ${sidebarBorder} border-sky-100/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_52%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(239,246,255,0.9))] shadow-[0_28px_80px_-52px_rgba(2,132,199,0.55)] backdrop-blur-xl`
            : `w-[216px] ${sidebarBorder} border-border/80 bg-[radial-gradient(circle_at_top_left,_hsl(var(--brand-cyan)/0.18),_transparent_52%),linear-gradient(180deg,_hsl(var(--card)/0.96),_hsl(var(--surface-3)/0.9))] shadow-[0_28px_80px_-52px_rgba(2,132,199,0.28)] backdrop-blur-xl`
          : `w-[200px] bg-slate-900 ${sidebarBorder} border-slate-800`
      )}
    >
      <div
        className={cn(
          "shrink-0 flex items-center gap-3",
          isAdminWorkspace
            ? "h-14 sm:h-16 px-5 border-b border-border/75 bg-white"
            : usesDualTierLayout
              ? "h-14 sm:h-16 px-4 border-b border-border/75 bg-[linear-gradient(180deg,_hsl(var(--card)/0.72),_hsl(var(--card)/0.24))]"
            : cn("px-4",
              usesModernWorkspaceShell
                ? usesLightWorkspaceSidebar
                  ? "h-14 sm:h-16 border-b border-sky-100/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.6),_rgba(255,255,255,0.22))]"
                  : "h-14 sm:h-16 border-b border-border/75 bg-[linear-gradient(180deg,_hsl(var(--card)/0.72),_hsl(var(--card)/0.24))]"
                : "h-14 sm:h-16 border-b border-slate-800"
              )
        )}
      >
        {usesModernWorkspaceShell ? (
          <Image
            src="/logo.png"
            alt="Mployedin"
            width={200}
            height={69}
            className="h-auto w-[132px] object-contain sm:w-[150px]"
            priority
          />
        ) : (
          <Image
            src="/logo.png"
            alt="Mployedin"
            width={200}
            height={69}
            className="h-auto w-[150px] object-contain"
            priority
          />
        )}
        <button
          type="button"
          onClick={() => onMobileClose?.()}
          aria-label={t("a11yCloseMenu")}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 lg:hidden",
            isRtl ? "mr-auto" : "ml-auto"
          )}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className={cn(
        "flex-1 overflow-y-auto flex flex-col sidebar-scroll",
        usesDualTierLayout ? "py-4 px-3 gap-1" : "py-4 px-3 gap-1"
      )}>
        {navigationMainItems.map((item, itemIndex) => {
          // A heading prints once, above the first item of its group.
          const groupLabel = groupLabelByItemHref.get(item.href);
          const previousGroupLabel =
            itemIndex > 0
              ? groupLabelByItemHref.get(navigationMainItems[itemIndex - 1].href)
              : undefined;
          const groupHeading =
            groupLabel && groupLabel !== previousGroupLabel ? (
              <div
                key={`group-${groupLabel}`}
                className={cn(
                  "px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] first:pt-1",
                  usesDualTierLayout ? "text-white/40" : "text-muted-foreground/70"
                )}
              >
                {groupLabel}
              </div>
            ) : null;
          const Icon = getIcon(item.icon);
          const isSelected = resolvedActiveMainTitle === item.title;
          const hasChildren = Boolean(item.children?.length);
          const itemSubmenuId = `sidebar-submenu-${item.title.toLowerCase().replace(/\s+/g, "-")}`;
          const showInlineChildren = usesInlineWorkspaceSidebar && hasChildren && isSelected && submenuExpanded;
          const submenuVariant = usesSimpleEmployerMenu ? "panel" : "inline";

          if (usesDualTierLayout) {
            const dualTierClass = cn(
              "group relative min-h-11 w-full flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
              isRtl ? "text-right" : "text-left",
              isSelected
                ? "bg-primary/10 text-primary shadow-[0_8px_24px_-12px_rgba(2,132,199,0.4)] ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-card/90 hover:text-foreground hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.18)]"
            );

            const dualTierLabel = locale === "ar" ? item.titleAr : item.title;

            const dualTierContent = (
              <>
                <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
                <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-5 line-clamp-2">
                  {dualTierLabel}
                </span>
                {badgeCount(item) > 0 && (
                  <span className="ms-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                    {badgeCount(item) > 99 ? "99+" : badgeCount(item)}
                  </span>
                )}
                {hasChildren && (
                  <ChevronDown
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isSelected && submenuExpanded && "rotate-180 text-primary"
                    )}
                  />
                )}
              </>
            );

            /* A group always toggles its panel and never navigates. "Hiring"
               used to open Applications on click because its href matched its
               first child; from Offers or Interviews that tap jumped the user
               to Applications when all they wanted was the list of siblings. */
            if (hasChildren) {
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => {
                    if (activeMainTitle === item.title) {
                      setSubmenuExpanded((prev) => !prev);
                    } else {
                      setActiveMainTitle(item.title);
                      setSubmenuExpanded(true);
                    }
                  }}
                  aria-controls={itemSubmenuId}
                  aria-expanded={isSelected && submenuExpanded}
                  title={dualTierLabel}
                  className={dualTierClass}
                >
                  {dualTierContent}
                </button>
              );
            }

            return (
              <Link
                key={item.title}
                href={item.href}
                aria-current={isSelected ? "page" : undefined}
                prefetch={false}
                onClick={() => {
                  setActiveMainTitle(item.title);
                  setSubmenuExpanded(false);
                  onMobileClose?.();
                }}
                title={dualTierLabel}
                className={dualTierClass}
              >
                {dualTierContent}
              </Link>
            );
          }

          const itemContent = (
            <>
              <Icon className={cn("w-[18px] h-[18px] shrink-0", usesSimpleEmployerMenu ? "mt-0.5" : "")} />
              <span
                className={cn(
                  "min-w-0 font-medium",
                  usesModernWorkspaceShell ? "text-[11px]" : "text-[13px]",
                  usesSimpleEmployerMenu
                    ? cn("flex-1 whitespace-normal break-words leading-5", isRtl ? "text-right" : "text-left")
                    : "truncate"
                )}
              >
                {locale === "ar" ? item.titleAr : item.title}
              </span>
              {badgeCount(item) > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                  {badgeCount(item) > 99 ? "99+" : badgeCount(item)}
                </span>
              )}
              {usesInlineWorkspaceSidebar && hasChildren && (
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
                    usesSimpleEmployerMenu ? "mt-0.5" : "",
                    showInlineChildren
                      ? usesLightWorkspaceSidebar
                        ? "rotate-180 text-sky-600"
                        : "rotate-180 text-primary"
                      : usesLightWorkspaceSidebar
                        ? "text-slate-400"
                        : "text-muted-foreground"
                  )}
                />
              )}
            </>
          );

          const itemClass = cn(
            "w-full flex transition-all duration-200 focus:outline-none focus-visible:ring-2",
            usesSimpleEmployerMenu ? "items-start gap-2.5 px-2.5 py-2.5" : "items-center gap-3 px-3 py-2.5",
            usesModernWorkspaceShell
              ? usesSimpleEmployerMenu
                ? isSelected
                  ? "rounded-lg bg-card/92 text-foreground shadow-sm ring-1 ring-border/60 focus-visible:ring-primary/35"
                  : "rounded-lg text-muted-foreground hover:bg-card/72 hover:text-foreground focus-visible:ring-primary/35"
                : usesLightWorkspaceSidebar
                ? isSelected
                  ? "rounded-2xl border border-sky-100 bg-white text-slate-950 shadow-[0_22px_44px_-30px_rgba(2,132,199,0.58)] focus-visible:ring-sky-300/70"
                  : "rounded-2xl border border-transparent text-slate-600 hover:border-sky-100/80 hover:bg-white/90 hover:text-slate-950 hover:shadow-[0_18px_32px_-30px_rgba(15,23,42,0.5)] focus-visible:ring-sky-300/70"
                : isSelected
                  ? "rounded-2xl border border-border bg-card text-foreground shadow-[0_22px_44px_-30px_rgba(2,132,199,0.38)] focus-visible:ring-primary/35"
                  : "rounded-2xl border border-transparent text-muted-foreground hover:border-border hover:bg-card/90 hover:text-foreground hover:shadow-[0_18px_32px_-30px_rgba(15,23,42,0.24)] focus-visible:ring-primary/35"
              : isSelected
                ? "rounded-2xl border border-transparent bg-white text-primary shadow-md focus-visible:ring-white/50"
                : "rounded-2xl border border-transparent text-white/60 hover:bg-white/10 hover:text-white focus-visible:ring-white/50"
          );

          if (hasChildren) {
            return (
              <div key={item.title} className="space-y-1">
                {groupHeading}
                <button
                  id={`${itemSubmenuId}-label`}
                  type="button"
                  onClick={() => {
                    if (usesInlineWorkspaceSidebar && isSelected) {
                      setSubmenuExpanded((previous) => !previous);
                      return;
                    }

                    setActiveMainTitle(item.title);
                    setSubmenuExpanded(true);
                  }}
                  aria-controls={usesInlineWorkspaceSidebar ? itemSubmenuId : undefined}
                  aria-expanded={usesInlineWorkspaceSidebar ? showInlineChildren : undefined}
                  className={itemClass}
                >
                  {itemContent}
                </button>

                {showInlineChildren && (
                  <div
                    id={itemSubmenuId}
                    role="region"
                    aria-labelledby={`${itemSubmenuId}-label`}
                    className={cn(
                      "space-y-1",
                      isRtl
                        ? "mr-4 border-r pr-3"
                        : "ml-4 border-l pl-3",
                      usesLightWorkspaceSidebar ? "border-sky-100/80" : "border-border/80"
                    )}
                  >
                    {item.children!.map((child) => renderSubmenuLink(
                      child,
                      submenuVariant,
                      item.children!.map((entry) => entry.href)
                    ))}
                  </div>
                )}
              </div>
            );
          }

          const leafLink = (
            <Link
              key={item.title}
              href={item.href}
              aria-current={isSelected ? "page" : undefined}
              prefetch={false}
              onClick={() => {
                setActiveMainTitle(item.title);
                onMobileClose?.();
              }}
              className={itemClass}
            >
              {itemContent}
            </Link>
          );

          if (!groupHeading) return leafLink;
          return (
            <div key={item.title} className="space-y-1">
              {groupHeading}
              {leafLink}
            </div>
          );
        })}
      </nav>
    </div>
  );

  if (usesInlineWorkspaceSidebar) {
    return (
      <>
        <aside className="hidden lg:flex h-full transition-all duration-300 relative z-40 bg-transparent">
          {primarySidebar}
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label={t("a11yNavigationMenu")}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => onMobileClose?.()} />

            <aside
              ref={mobileSidebarRef}
              tabIndex={-1}
              className={cn(
              "relative flex h-full max-w-[88vw] animate-in duration-300 ease-out shadow-2xl",
                "bg-transparent",
              isRtl ? "right-0 left-auto slide-in-from-right" : "slide-in-from-left"
            )}
          >
              {primarySidebar}
            </aside>
          </div>
        )}
      </>
    );
  }

  const secondarySidebar = (
    <div
      className={cn(
        "h-full overflow-hidden transition-[width] duration-300 ease-in-out z-10 flex flex-col shrink-0",
        usesDualTierLayout
          ? cn(
              "lg:absolute lg:top-0 bg-[linear-gradient(180deg,_hsl(var(--card)/0.99),_hsl(var(--surface-3)/0.96))] shadow-[8px_0_36px_rgba(2,132,199,0.14)]",
              isRtl ? "lg:right-[224px]" : "lg:left-[224px]",
              isRtl ? "border-l border-border/60" : "border-r border-border/60"
            )
          : cn(
              "bg-surface-2 shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
              isRtl ? "border-l border-sidebar-border" : "border-r border-sidebar-border"
            ),
        hasSubmenu && submenuExpanded ? "w-[280px] max-w-[88vw] lg:w-[272px]" : "w-0 border-r-0 border-l-0"
      )}
    >
      {activeMainItem && hasSubmenu && submenuExpanded && (
        <div className="flex h-full min-w-[280px] max-w-[88vw] flex-col lg:min-w-[272px]">
          {/* Same height as the logo row and the topbar — h-20 here left the
              submenu header sitting below both, so no border line matched. */}
          <div className={cn(
            "shrink-0 flex h-14 items-center px-4 sm:h-16",
            usesDualTierLayout
              ? "border-b border-border/50 bg-[linear-gradient(180deg,_hsl(var(--card)/0.72),_hsl(var(--card)/0.24))] backdrop-blur-sm"
              : "border-b border-sidebar-border/50 bg-background/50 backdrop-blur-sm"
          )}>
            {/* Mobile drill-down: back to the primary menu (drawer shows one tier at a time) */}
            <button
              type="button"
              onClick={() => {
                if (activeMobileNestedItem) setActiveMobileNestedItem(null);
                else setSubmenuExpanded(false);
              }}
              aria-label={t("back")}
              className={cn(
                "lg:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted",
                isRtl ? "ml-2" : "mr-2"
              )}
            >
              {isRtl ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
            <h2 className={cn(
              "min-w-0 truncate text-base font-bold tracking-tight",
              usesDualTierLayout ? "text-foreground" : "text-sidebar-fg"
            )}>
              {locale === "ar"
                ? (activeMobileNestedItem?.titleAr ?? activeMainItem.titleAr)
                : (activeMobileNestedItem?.title ?? activeMainItem.title)}
            </h2>
            <button
              type="button"
              onClick={() => {
                if (mobileOpen) onMobileClose?.();
                else setSubmenuExpanded(false);
              }}
              aria-label={t("a11yCloseMenu")}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                isRtl ? "mr-auto" : "ml-auto"
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 sidebar-scroll">
            <div className="space-y-1">
              <div id={submenuId} className="space-y-4">
                {(() => {
                  const children = activeMobileNestedItem?.children ?? activeMainItem.children!;
                  const allHrefs = children.map((entry) => entry.href);
                  const hasGroups = children.some((c) => c.group);

                  if (!hasGroups) {
                    return (
                      <div className="space-y-1">
                        {children.map((child) => renderSubmenuLink(child, "panel", allHrefs))}
                      </div>
                    );
                  }

                  const groups: { key: string; label: string; items: NavItem[] }[] = [];
                  const seen = new Set<string>();
                  for (const child of children) {
                    const key = child.group ?? "";
                    if (!seen.has(key)) {
                      seen.add(key);
                      groups.push({
                        key,
                        label: locale === "ar" ? (child.groupAr ?? child.group ?? "") : (child.group ?? ""),
                        items: [],
                      });
                    }
                    groups.find((g) => g.key === key)!.items.push(child);
                  }

                  return groups.map((g) => (
                    <div key={g.key || "_ungrouped"}>
                      {g.label && (
                        <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
                          {g.label}
                        </h3>
                      )}
                      <div className="space-y-0.5">
                        {g.items.map((child) => renderSubmenuLink(child, "panel", allHrefs))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </nav>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside
        ref={desktopSidebarRef}
        className={cn(
        "hidden lg:flex h-full transition-all duration-300 relative z-40",
        usesDualTierLayout ? "bg-transparent" : "bg-background"
      )}>
        {primarySidebar}
        {secondarySidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label={t("a11yNavigationMenu")}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => onMobileClose?.()} />

          <aside
            ref={mobileSidebarRef}
            tabIndex={-1}
            className={cn(
              "relative flex h-full max-w-[88vw] animate-in duration-300 ease-out shadow-2xl",
              usesDualTierLayout ? "bg-transparent" : "bg-background",
              isRtl ? "right-0 left-auto slide-in-from-right" : "slide-in-from-left"
            )}
          >
            {/* Drill-down: one tier at a time on mobile (both tiers side by side
                overflow a phone). Back button in the submenu header returns. */}
            {hasSubmenu && submenuExpanded ? secondarySidebar : primarySidebar}
          </aside>
        </div>
      )}
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("nav");
  return (
    <button
      onClick={onClick}
      className="lg:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card/80 hover:bg-card shadow-[0_18px_36px_-28px_rgba(15,23,42,0.24)] backdrop-blur-sm transition-colors"
      aria-label={t("a11yOpenMenu")}
    >
      <Menu className="h-5 w-5 text-foreground" />
    </button>
  );
}
