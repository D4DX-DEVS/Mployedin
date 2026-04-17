"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup, NavItem } from "@/lib/nav/menuConfig";
import { getIcon } from "@/lib/nav/iconRegistry";

function usePendingApprovalCount(role: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (role !== "super_agent") return;
    let cancelled = false;

    fetch("/api/super-agent/approvals/count")
      .then((response) => response.ok ? response.json() : { count: 0 })
      .then((data: { count?: number }) => {
        if (!cancelled) setCount(data.count ?? 0);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [role]);

  return count;
}

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
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const effectiveRole = userRole ?? sessionRole;
  const pendingApprovals = usePendingApprovalCount(effectiveRole);
  const isRtl = locale === "ar";
  const usesModernWorkspaceShell = effectiveRole === "admin" || effectiveRole === "employer" || effectiveRole === "agent" || effectiveRole === "super_agent";
  const usesInlineWorkspaceSidebar = usesModernWorkspaceShell;
  const workspaceLabel = effectiveRole === "super_agent"
    ? "Super agent workspace"
    : effectiveRole === "admin"
      ? "Admin workspace"
    : effectiveRole === "agent"
      ? "Agent workspace"
      : "Employer workspace";
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
  const [submenuExpanded, setSubmenuExpanded] = useState(true);

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
    setSubmenuExpanded(true);
  }, [activeMainTitle]);

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
        onClick={() => onMobileClose?.()}
        className={cn(
          "flex items-center gap-3 transition-all duration-200 group relative overflow-hidden",
          focusRingClass,
          variant === "inline"
            ? cn(
                "rounded-2xl border px-3 py-2.5",
                inlineLinkClass
              )
            : cn(
                "rounded-lg px-3 py-2.5",
                isChildActive
                  ? "bg-card text-primary font-bold shadow-sm ring-1 ring-border/50"
                  : "text-sidebar-fg/70 hover:bg-card hover:text-sidebar-fg font-medium hover:shadow-sm hover:ring-1 hover:ring-border/50"
              )
        )}
      >
        {isChildActive && (
          <div
            className={cn(
              "absolute left-0 top-1/2 h-1/2 w-1 -translate-y-1/2 rounded-r-full",
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
            variant === "inline"
              ? inlineIconClass
              : isChildActive
                ? "text-primary"
                : "text-muted-foreground group-hover:text-brand-blue"
          )}
        />
        <span className="truncate">{locale === "ar" ? child.titleAr : child.title}</span>
        {child.title === "Approvals" && pendingApprovals > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {pendingApprovals > 99 ? "99+" : pendingApprovals}
          </span>
        )}
      </Link>
    );
  }

  const primarySidebar = (
    <div
      data-sidebar-tone={usesLightWorkspaceSidebar ? "light" : "theme-aware"}
      className={cn(
        "h-full flex flex-col z-20 shrink-0",
        usesModernWorkspaceShell
          ? usesLightWorkspaceSidebar
            ? "w-[216px] border-r border-sky-100/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_52%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(239,246,255,0.9))] shadow-[0_28px_80px_-52px_rgba(2,132,199,0.55)] backdrop-blur-xl"
            : "w-[216px] border-r border-border/80 bg-[radial-gradient(circle_at_top_left,_hsl(var(--brand-cyan)/0.18),_transparent_52%),linear-gradient(180deg,_hsl(var(--card)/0.96),_hsl(var(--surface-3)/0.9))] shadow-[0_28px_80px_-52px_rgba(2,132,199,0.28)] backdrop-blur-xl"
          : "w-[200px] bg-slate-900 border-r border-slate-800"
      )}
    >
      <div
        className={cn(
          "shrink-0 flex items-center gap-3 px-4",
          usesModernWorkspaceShell
            ? usesLightWorkspaceSidebar
              ? "h-20 border-b border-sky-100/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.6),_rgba(255,255,255,0.22))]"
              : "h-20 border-b border-border/75 bg-[linear-gradient(180deg,_hsl(var(--card)/0.72),_hsl(var(--card)/0.24))]"
            : "h-16 border-b border-slate-800"
        )}
      >
        {displayImage && !imageLoadFailed ? (
          <div
            className={cn(
              "overflow-hidden bg-card shrink-0",
              usesModernWorkspaceShell
                ? usesLightWorkspaceSidebar
                  ? "h-12 w-12 rounded-2xl border border-sky-100 bg-white shadow-[0_20px_40px_-28px_rgba(2,132,199,0.55)] ring-4 ring-white/70"
                  : "h-12 w-12 rounded-2xl border border-border shadow-[0_20px_40px_-28px_rgba(2,132,199,0.34)] ring-4 ring-background/70"
                : "w-9 h-9 rounded-xl shadow-lg ring-1 ring-white/20"
            )}
          >
            <Image
              src={displayImage}
              alt={companyLogo ? "Company logo" : "Profile image"}
              width={40}
              height={40}
              className={cn("w-full h-full", companyLogo ? "object-contain" : "object-cover")}
              onError={() => setImageLoadFailed(true)}
              unoptimized
              priority
            />
          </div>
        ) : !companyLogo && status === "loading" ? (
          <div
            className={cn(
              "animate-pulse shrink-0",
              usesModernWorkspaceShell
                ? usesLightWorkspaceSidebar
                  ? "h-12 w-12 rounded-2xl border border-sky-100/80 bg-white/80 ring-4 ring-white/70"
                  : "h-12 w-12 rounded-2xl border border-border bg-card/80 ring-4 ring-background/70"
                : "w-9 h-9 rounded-xl bg-slate-700/70 ring-1 ring-white/20"
            )}
          />
        ) : (
          <div
            className={cn(
              "flex items-center justify-center font-bold shrink-0",
              usesModernWorkspaceShell
                ? usesLightWorkspaceSidebar
                  ? "h-12 w-12 rounded-2xl bg-[linear-gradient(135deg,_rgba(14,165,233,0.98),_rgba(37,99,235,0.94))] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.7)] ring-4 ring-white/70 text-xl"
                  : "h-12 w-12 rounded-2xl bg-[linear-gradient(135deg,_rgba(14,165,233,0.98),_rgba(37,99,235,0.94))] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.7)] ring-4 ring-background/70 text-xl"
                : "w-9 h-9 rounded-xl bg-primary text-primary-foreground shadow-lg text-lg ring-1 ring-white/20"
            )}
          >
            M
          </div>
        )}
        <div className="min-w-0">
          <span
            className={cn(
              "block truncate font-semibold tracking-tight",
              usesModernWorkspaceShell
                ? usesLightWorkspaceSidebar
                  ? "text-base text-slate-950"
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

      <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1 sidebar-scroll">
        {allMainItems.map((item) => {
          const Icon = getIcon(item.icon);
          const isSelected = activeMainTitle === item.title;
          const hasChildren = Boolean(item.children?.length);
          const itemSubmenuId = `sidebar-submenu-${item.title.toLowerCase().replace(/\s+/g, "-")}`;
          const showInlineChildren = usesInlineWorkspaceSidebar && hasChildren && isSelected && submenuExpanded;

          const itemContent = (
            <>
              <Icon className="w-[18px] h-[18px] shrink-0" />
              <span className="truncate text-[13px] font-medium">{locale === "ar" ? item.titleAr : item.title}</span>
              {usesInlineWorkspaceSidebar && hasChildren && (
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
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
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-all duration-200 focus:outline-none focus-visible:ring-2",
            usesModernWorkspaceShell
              ? usesLightWorkspaceSidebar
                ? isSelected
                  ? "border-sky-100 bg-white text-slate-950 shadow-[0_22px_44px_-30px_rgba(2,132,199,0.58)] focus-visible:ring-sky-300/70"
                  : "border-transparent text-slate-600 hover:border-sky-100/80 hover:bg-white/90 hover:text-slate-950 hover:shadow-[0_18px_32px_-30px_rgba(15,23,42,0.5)] focus-visible:ring-sky-300/70"
                : isSelected
                  ? "border-border bg-card text-foreground shadow-[0_22px_44px_-30px_rgba(2,132,199,0.38)] focus-visible:ring-primary/35"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-card/90 hover:text-foreground hover:shadow-[0_18px_32px_-30px_rgba(15,23,42,0.24)] focus-visible:ring-primary/35"
              : isSelected
                ? "border-transparent bg-white text-primary shadow-md focus-visible:ring-white/50"
                : "border-transparent text-white/60 hover:bg-white/10 hover:text-white focus-visible:ring-white/50"
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
                      "ml-4 space-y-1 border-l pl-3",
                      usesLightWorkspaceSidebar ? "border-sky-100/80" : "border-border/80"
                    )}
                  >
                    {item.children!.map((child) => renderSubmenuLink(
                      child,
                      "inline",
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
        "h-full overflow-hidden transition-[width] duration-300 ease-in-out z-10 flex flex-col shrink-0 bg-surface-2 border-r border-sidebar-border shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
        hasSubmenu ? "w-[240px]" : "w-0 border-r-0"
      )}
    >
      {activeMainItem && hasSubmenu && (
        <div className="flex flex-col h-full min-w-[240px]">
          <div className="h-16 shrink-0 flex items-center border-b border-sidebar-border/50 bg-background/50 px-6 backdrop-blur-sm">
            <h2 className="text-[15px] font-bold tracking-tight text-sidebar-fg">
              {locale === "ar" ? activeMainItem.titleAr : activeMainItem.title}
            </h2>
            <button
              onClick={() => onMobileClose?.()}
              className="lg:hidden ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-5 sidebar-scroll">
            <div className="space-y-1">
              <div id={submenuId} className="space-y-1">
                {activeMainItem.children!.map((child) => renderSubmenuLink(
                  child,
                  "panel",
                  activeMainItem.children!.map((entry) => entry.href)
                ))}
              </div>
            </div>
          </nav>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex h-full transition-all duration-300 relative z-40 bg-background">
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
              "relative flex h-full max-w-[85vw] animate-in duration-300 ease-out shadow-2xl bg-background",
              isRtl ? "right-0 left-auto slide-in-from-right" : "slide-in-from-left"
            )}
          >
            {primarySidebar}
            {secondarySidebar}
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
