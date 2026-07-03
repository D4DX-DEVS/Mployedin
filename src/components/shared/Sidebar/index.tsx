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
import { getIcon } from "@/lib/nav/iconRegistry";
import { useConversations } from "@/hooks/useConversations";

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
  companyLogo,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const t = useTranslations("nav");
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const effectiveRole = userRole ?? sessionRole;
  const isRtl = locale === "ar";
  const currentUserId = (session?.user as unknown as { id?: string })?.id ?? "";
  const { data: conversations } = useConversations();
  const unreadMessageCount = (conversations ?? []).reduce(
    (sum, c) => sum + (c.unreadCounts?.[currentUserId] ?? 0),
    0
  );
  const usesSimpleEmployerMenu = effectiveRole === "employer";
  const isSuperAgent = effectiveRole === "super_agent";
  const usesModernWorkspaceShell = effectiveRole === "admin" || effectiveRole === "employer" || effectiveRole === "agent" || effectiveRole === "super_agent";
  const usesDualTierLayout = effectiveRole === "admin" || effectiveRole === "employer" || effectiveRole === "agent" || effectiveRole === "super_agent";
  const usesInlineWorkspaceSidebar = usesModernWorkspaceShell && !usesDualTierLayout;
  const workspaceLabel = effectiveRole === "super_agent"
    ? t("superAgentWorkspace")
    : effectiveRole === "admin"
      ? t("adminWorkspace")
    : effectiveRole === "agent"
      ? t("agentWorkspace")
      : t("employerWorkspace");
  const usesLightWorkspaceSidebar = false;
  const userImage = session?.user?.image;
  const displayImage = companyLogo ?? userImage;
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const mobileSidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [displayImage]);

  const allMainItems = navGroups.flatMap((group) => group.items);

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

    for (const item of allMainItems) {
      if (pathname.startsWith(item.href + "/")) return item.title;
    }

    return allMainItems[0]?.title || "";
  };

  const [activeMainTitle, setActiveMainTitle] = useState<string>(getInitialActiveItem());
  // Dual-tier layouts keep the secondary panel collapsed until the user opens a
  // group, so page content always uses the full width (no squeezing / clipping).
  const [submenuExpanded, setSubmenuExpanded] = useState(!usesDualTierLayout);

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
    // Dual-tier stays collapsed until the user explicitly opens a group, and
    // collapses again after a child page is selected (handled in onClick).
    if (!usesDualTierLayout) setSubmenuExpanded(true);
  }, [activeMainTitle, usesDualTierLayout]);

  const activeMainItem = allMainItems.find((item) => item.title === activeMainTitle);
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

    return (
      <Link
        key={child.href}
        href={child.href}
        prefetch={false}
        onClick={() => {
          if (usesDualTierLayout) setSubmenuExpanded(false);
          onMobileClose?.();
        }}
        className={cn(
          "flex transition-all duration-200 group relative overflow-hidden",
          usesSimpleEmployerMenu && variant === "panel"
            ? "items-start gap-2.5"
            : "items-center gap-3",
          focusRingClass,
          variant === "inline"
            ? cn(
                "rounded-2xl border px-3 py-2.5",
                inlineLinkClass
              )
            : cn(
                usesSimpleEmployerMenu ? "rounded-lg px-2.5 py-2.5 text-[12px]" : "rounded-xl px-3 py-2.5",
                isChildActive
                  ? usesSimpleEmployerMenu
                    ? "bg-card text-primary font-semibold shadow-sm ring-1 ring-border/50"
                    : usesDualTierLayout
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
            usesSimpleEmployerMenu && variant === "panel" ? "mt-0.5 h-4 w-4" : "",
            variant === "inline"
              ? inlineIconClass
              : isChildActive
                ? "text-primary"
                : "text-muted-foreground group-hover:text-brand-blue"
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1",
            usesModernWorkspaceShell ? "text-[10px]" : "",
            usesSimpleEmployerMenu && variant === "panel"
              ? cn("whitespace-normal break-words text-[10px] leading-5", isRtl ? "text-right" : "text-left")
              : "truncate"
          )}
        >
          {locale === "ar" ? child.titleAr : child.title}
        </span>
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
          ? `w-[196px] ${sidebarBorder} border-border/80 bg-[radial-gradient(circle_at_top_left,_hsl(var(--brand-cyan)/0.22),_transparent_60%),linear-gradient(180deg,_hsl(var(--card)/0.98),_hsl(var(--surface-3)/0.94))] shadow-[0_28px_80px_-52px_rgba(2,132,199,0.32)] backdrop-blur-xl`
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
          usesDualTierLayout
            ? "h-20 px-3 border-b border-border/75 bg-[linear-gradient(180deg,_hsl(var(--card)/0.72),_hsl(var(--card)/0.24))]"
            : cn("px-4",
              usesModernWorkspaceShell
                ? usesLightWorkspaceSidebar
                  ? "h-20 border-b border-sky-100/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.6),_rgba(255,255,255,0.22))]"
                  : "h-20 border-b border-border/75 bg-[linear-gradient(180deg,_hsl(var(--card)/0.72),_hsl(var(--card)/0.24))]"
                : "h-16 border-b border-slate-800"
              )
        )}
      >
        <div
          className={cn(
            "overflow-hidden shrink-0",
            usesDualTierLayout
              ? "h-10 w-10 rounded-xl border border-border shadow-[0_16px_32px_-24px_rgba(2,132,199,0.34)] ring-2 ring-background/70 bg-white dark:bg-slate-800"
              : usesModernWorkspaceShell
              ? "h-12 w-12 rounded-2xl border border-border shadow-[0_20px_40px_-28px_rgba(2,132,199,0.34)] ring-4 ring-background/70 bg-white dark:bg-slate-800"
              : "w-9 h-9 rounded-xl shadow-lg ring-1 ring-white/20 bg-white dark:bg-slate-800"
          )}
        >
          <Image
            src="/logo.png"
            alt="Mployedin"
            width={48}
            height={48}
            className="w-full h-full object-contain p-1 dark:brightness-0 dark:invert"
            priority
          />
        </div>
        <div className="min-w-0">
          <span
            className={cn(
              "block truncate font-semibold tracking-tight",
              usesModernWorkspaceShell
                ? usesLightWorkspaceSidebar
                  ? "text-base text-slate-950"
                  : usesDualTierLayout
                    ? "text-sm text-foreground"
                    : "text-base text-foreground"
                : "text-sm text-white font-bold tracking-wide"
            )}
          >
            Mployedin
          </span>
          {usesModernWorkspaceShell && (
            <span className={cn(
              "mt-0.5 block truncate text-[11px] font-medium uppercase tracking-[0.16em]",
              usesLightWorkspaceSidebar ? "text-sky-700/70" : "text-primary/75"
            )}>
              {workspaceLabel}
            </span>
          )}
        </div>
      </div>

      <nav className={cn(
        "flex-1 overflow-y-auto flex flex-col sidebar-scroll",
        usesDualTierLayout ? "py-3 px-2.5 gap-0.5" : "py-4 px-3 gap-1"
      )}>
        {allMainItems.map((item) => {
          const Icon = getIcon(item.icon);
          const isSelected = activeMainTitle === item.title;
          const hasChildren = Boolean(item.children?.length);
          const itemSubmenuId = `sidebar-submenu-${item.title.toLowerCase().replace(/\s+/g, "-")}`;
          const showInlineChildren = usesInlineWorkspaceSidebar && hasChildren && isSelected && submenuExpanded;
          const submenuVariant = usesSimpleEmployerMenu ? "panel" : "inline";

          if (usesDualTierLayout) {
            const dualTierClass = cn(
              "group relative w-full flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
              isSelected
                ? "bg-primary/10 text-primary shadow-[0_8px_24px_-12px_rgba(2,132,199,0.4)] ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-card/90 hover:text-foreground hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.18)]"
            );

            const dualTierLabel = locale === "ar" ? item.titleAr : item.title;

            const dualTierContent = (
              <>
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="min-w-0 truncate text-[11px] font-medium">{dualTierLabel}</span>
                {item.title === "Messages" && unreadMessageCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                  </span>
                )}
              </>
            );

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
                prefetch={false}
                onClick={() => {
                  setActiveMainTitle(item.title);
                  onMobileClose?.();
                }}
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
              {item.title === "Messages" && unreadMessageCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
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

          return (
            <Link
              key={item.title}
              href={item.href}
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
          <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => onMobileClose?.()} />

            <aside
              ref={mobileSidebarRef}
              tabIndex={-1}
              className={cn(
              "relative flex h-full max-w-[85vw] animate-in duration-300 ease-out shadow-2xl",
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
              "bg-[linear-gradient(180deg,_hsl(var(--card)/0.98),_hsl(var(--surface-3)/0.94))] shadow-[4px_0_28px_rgba(2,132,199,0.06)]",
              isRtl ? "border-l border-border/60" : "border-r border-border/60"
            )
          : cn(
              "bg-surface-2 shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
              isRtl ? "border-l border-sidebar-border" : "border-r border-sidebar-border"
            ),
        hasSubmenu && submenuExpanded ? "w-[240px]" : "w-0 border-r-0 border-l-0"
      )}
    >
      {activeMainItem && hasSubmenu && submenuExpanded && (
        <div className="flex flex-col h-full min-w-[240px]">
          <div className={cn(
            "shrink-0 flex items-center px-5",
            usesDualTierLayout
              ? "h-20 border-b border-border/50 bg-[linear-gradient(180deg,_hsl(var(--card)/0.72),_hsl(var(--card)/0.24))] backdrop-blur-sm"
              : "h-20 border-b border-sidebar-border/50 bg-background/50 backdrop-blur-sm"
          )}>
            {/* Mobile drill-down: back to the primary menu (drawer shows one tier at a time) */}
            <button
              type="button"
              onClick={() => setSubmenuExpanded(false)}
              aria-label={t("back")}
              className={cn(
                "lg:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted",
                isRtl ? "ml-2" : "mr-2"
              )}
            >
              {isRtl ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
            <h2 className={cn(
              "text-[15px] font-bold tracking-tight",
              usesDualTierLayout ? "text-foreground" : "text-sidebar-fg"
            )}>
              {locale === "ar" ? activeMainItem.titleAr : activeMainItem.title}
            </h2>
            <button
              onClick={() => onMobileClose?.()}
              className={cn(
                "lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted",
                isRtl ? "mr-auto" : "ml-auto"
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-5 sidebar-scroll">
            <div className="space-y-1">
              <div id={submenuId} className="space-y-4">
                {(() => {
                  const children = activeMainItem.children!;
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
                        <h3 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
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
      <aside className={cn(
        "hidden lg:flex h-full transition-all duration-300 relative z-40",
        usesDualTierLayout ? "bg-transparent" : "bg-background"
      )}>
        {primarySidebar}
        {secondarySidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => onMobileClose?.()} />

          <aside
            ref={mobileSidebarRef}
            tabIndex={-1}
            className={cn(
              "relative flex h-full max-w-[85vw] animate-in duration-300 ease-out shadow-2xl",
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
  return (
    <button
      onClick={onClick}
      className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card/80 hover:bg-card shadow-[0_18px_36px_-28px_rgba(15,23,42,0.24)] backdrop-blur-sm transition-colors"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5 text-foreground" />
    </button>
  );
}
