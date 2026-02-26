"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/nav/menuConfig";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

interface SidebarProps {
  navGroups: NavGroup[];
  locale: string;
}

export function Sidebar({ navGroups, locale }: SidebarProps) {
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

  return (
    <aside
      className={cn(
        "sidebar relative flex flex-col transition-all duration-300 overflow-hidden",
        collapsed ? "sidebar-collapsed" : "sidebar-expanded"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        {/* Globe icon placeholder */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center">
          <span className="text-white text-xs font-bold">M</span>
        </div>
        {!collapsed && (
          <span className="text-white font-bold text-lg tracking-tight">
            mployedin
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navGroups.map((group, gi) => (
          <div key={gi} className="mb-4">
            {!collapsed && group.label && (
              <div className="px-3 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                  {locale === "ar" && group.labelAr
                    ? group.labelAr
                    : group.label}
                </span>
              </div>
            )}
            {group.items.map((item) => {
              const hasChildren = item.children && item.children.length > 0;
              const groupKey = item.title;
              const open = openGroups.has(groupKey);
              const active = isActive(item.href);

              return (
                <div key={item.href}>
                  {hasChildren ? (
                    <button
                      onClick={() => toggleGroup(groupKey)}
                      className={cn(
                        "sidebar-item w-full text-left",
                        active && "sidebar-item-active",
                        collapsed && "justify-center"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "sidebar-icon",
                          active ? "text-white" : "text-white/60"
                        )}
                      />
                      {!collapsed && (
                        <>
                          <span className="sidebar-label">
                            {locale === "ar" ? item.titleAr : item.title}
                          </span>
                          <ChevronDown
                            className={cn(
                              "w-4 h-4 ml-auto transition-transform",
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
                        "sidebar-item",
                        active && "sidebar-item-active",
                        collapsed && "justify-center"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "sidebar-icon",
                          active ? "text-white" : "text-white/60"
                        )}
                      />
                      {!collapsed && (
                        <span className="sidebar-label">
                          {locale === "ar" ? item.titleAr : item.title}
                        </span>
                      )}
                      {!collapsed && item.badge && (
                        <span className="ml-auto text-xs bg-brand-blue text-white rounded-full px-1.5 py-0.5">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  )}

                  {/* Sub-items */}
                  {hasChildren && open && !collapsed && (
                    <div className="ml-4 mt-1 border-l border-white/10 pl-2">
                      {item.children!.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "sidebar-item text-sm",
                            isActive(child.href) && "sidebar-item-active"
                          )}
                        >
                          <child.icon className="sidebar-icon w-4 h-4" />
                          <span className="sidebar-label">
                            {locale === "ar" ? child.titleAr : child.title}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle button */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-sidebar-bg text-white/60 hover:text-white"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <CollapseIcon className="w-3 h-3" />
      </button>
    </aside>
  );
}
