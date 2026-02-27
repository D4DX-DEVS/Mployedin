"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/nav/menuConfig";
import { getIcon } from "@/lib/nav/iconRegistry";
import { ChevronLeft, ChevronRight, ChevronDown, Menu, X } from "lucide-react";

interface SidebarProps {
  navGroups: NavGroup[];
  locale: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ navGroups, locale, mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const isRtl = locale === "ar";
  const CollapseIcon = isRtl
    ? collapsed
      ? ChevronLeft
      : ChevronRight
    : collapsed
      ? ChevronRight
      : ChevronLeft;

  // Close mobile drawer on route change
  useEffect(() => {
    onMobileClose?.();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand accordion group that contains the active page
  useEffect(() => {
    const activeKeys = new Set<string>();
    for (const group of navGroups) {
      for (const item of group.items) {
        if (item.children?.some((child) => pathname === child.href || pathname.startsWith(child.href + "/"))) {
          activeKeys.add(item.title);
        }
      }
    }
    if (activeKeys.size > 0) {
      setOpenGroups((prev) => {
        const next = new Set(prev);
        activeKeys.forEach((k) => next.add(k));
        return next;
      });
    }
  }, [pathname, navGroups]);

  // Prevent body scroll when mobile drawer open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="flex-shrink-0 w-8 h-8 rounded-full brand-gradient flex items-center justify-center shadow-soft">
          <span className="text-white text-xs font-bold">M</span>
        </div>
        {!collapsed && (
          <span className="text-sidebar-fg font-bold text-lg tracking-tight">
            mployedin
          </span>
        )}
        {/* Mobile close button */}
        <button
          onClick={() => onMobileClose?.()}
          className="ml-auto lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-fg/60 hover:text-sidebar-fg hover:bg-sidebar-hover-bg"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 sidebar-scroll">
        {navGroups.map((group, gi) => (
          <div key={gi} className="mb-2">
            {group.items.map((item) => {
              const hasChildren = item.children && item.children.length > 0;
              const groupKey = item.title;
              const open = openGroups.has(groupKey);
              const childActive = hasChildren && item.children!.some((c) => isActive(c.href));
              const active = isActive(item.href) || childActive;

              return (
                <div key={item.title + item.href}>
                  {hasChildren ? (
                    <button
                      onClick={() => toggleGroup(groupKey)}
                      className={cn(
                        "sidebar-item w-full text-left mb-0.5",
                        childActive && "sidebar-item-active",
                        collapsed && "justify-center"
                      )}
                    >
                      {(() => { const Icon = getIcon(item.icon); return <Icon className={cn("sidebar-icon", childActive ? "text-sidebar-active-fg" : "text-sidebar-icon")} />; })()}
                      {!collapsed && (
                        <>
                          <span className="sidebar-label font-medium">
                            {locale === "ar" ? item.titleAr : item.title}
                          </span>
                          <ChevronDown
                            className={cn(
                              "w-4 h-4 ml-auto transition-transform duration-200",
                              open && "rotate-180"
                            )}
                          />
                        </>
                      )}
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn(
                        "sidebar-item mb-0.5",
                        active && "sidebar-item-active",
                        collapsed && "justify-center"
                      )}
                    >
                      {(() => { const Icon = getIcon(item.icon); return <Icon className={cn("sidebar-icon", active ? "text-sidebar-active-fg" : "text-sidebar-icon")} />; })()}
                      {!collapsed && (
                        <span className="sidebar-label font-medium">
                          {locale === "ar" ? item.titleAr : item.title}
                        </span>
                      )}
                      {!collapsed && item.badge && (
                        <span className="ml-auto text-[10px] font-bold tracking-wide uppercase bg-primary/10 text-primary rounded-full px-2 py-0.5">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  )}

                  {/* Accordion sub-items with icons */}
                  {hasChildren && !collapsed && (
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200 ease-in-out",
                        open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                      )}
                    >
                      <div className="ml-[1.15rem] mt-0.5 mb-1 border-l-2 border-sidebar-border pl-3 space-y-0.5">
                        {item.children!.map((child) => {
                          const ChildIcon = getIcon(child.icon);
                          const childIsActive = isActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "sidebar-item text-sm py-1.5 px-3 rounded-md transition-colors",
                                childIsActive
                                  ? "text-sidebar-active-fg font-medium bg-sidebar-active-bg/50"
                                  : "text-sidebar-fg/70 hover:text-sidebar-fg hover:bg-sidebar-hover-bg"
                              )}
                            >
                              <ChildIcon className={cn(
                                "w-4 h-4 flex-shrink-0",
                                childIsActive ? "text-sidebar-active-fg" : "text-sidebar-icon"
                              )} />
                              <span className="sidebar-label">
                                {locale === "ar" ? child.titleAr : child.title}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside
        className={cn(
          "sidebar relative hidden lg:flex flex-col transition-all duration-300 overflow-hidden",
          collapsed ? "sidebar-collapsed" : "sidebar-expanded"
        )}
      >
        {navContent}

        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-bg text-sidebar-fg/50 hover:text-sidebar-fg shadow-sm transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CollapseIcon className="w-3 h-3" />
        </button>
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => onMobileClose?.()}
          />
          {/* Drawer */}
          <aside
            className={cn(
              "sidebar absolute top-0 bottom-0 flex flex-col w-[280px] max-w-[85vw] z-10 animate-in slide-in-from-left duration-300",
              isRtl && "right-0 left-auto slide-in-from-right"
            )}
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}

/** Hamburger button — exported for use in the top bar */
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent transition-colors"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
