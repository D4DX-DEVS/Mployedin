"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup, NavItem } from "@/lib/nav/menuConfig";
import { getIcon } from "@/lib/nav/iconRegistry";
import { Menu, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  navGroups: NavGroup[];
  locale: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ navGroups, locale, mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const isRtl = locale === "ar";

  // Flatten all top-level items from groups (usually just 1 group, but just in case)
  const allMainItems = navGroups.flatMap(g => g.items);

  // Find the active main item based on pathname to set initial state
  const getInitialActiveItem = () => {
    for (const item of allMainItems) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) return item.title;
      if (item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + "/"))) return item.title;
    }
    return allMainItems[0]?.title || "";
  };

  const [activeMainTitle, setActiveMainTitle] = useState<string>(getInitialActiveItem());

  // Update active item if route changes (e.g. from command menu)
  useEffect(() => {
    const current = getInitialActiveItem();
    if (current) setActiveMainTitle(current);
    // eslint-disable-next-deps
  }, [pathname, navGroups]);

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const activeMainItem = allMainItems.find(i => i.title === activeMainTitle);
  const hasSubmenu = activeMainItem?.children && activeMainItem.children.length > 0;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  // --- Primary Icon Sidebar ---
  const primarySidebar = (
    <div className="w-[80px] h-full flex flex-col bg-brand-blue-dark border-r border-[#ffffff1a] z-20 shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-[#ffffff1a] shrink-0">
        <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg font-bold text-xl ring-1 ring-white/20">
          M
        </div>
      </div>

      {/* Icon Nav */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-4 items-center sidebar-scroll">
        <TooltipProvider>
          {allMainItems.map(item => {
            const Icon = getIcon(item.icon);
            const isSelected = activeMainTitle === item.title;
            const childActive = item.children?.some(c => isActive(c.href));
            const isReallyActive = isActive(item.href) || childActive;

            return (
              <Tooltip key={item.title} delayDuration={0}>
                <TooltipTrigger asChild>
                  {item.children && item.children.length > 0 ? (
                    <button
                      onClick={() => setActiveMainTitle(item.title)}
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group relative",
                        isSelected
                          ? "bg-white text-primary shadow-lg shadow-black/20"
                          : "text-white/60 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icon className="w-[22px] h-[22px] shrink-0" />
                      {isSelected && (
                        <div className={cn("absolute w-1.5 h-6 bg-white rounded-full", isRtl ? "-left-1.5" : "-right-1.5")} />
                      )}
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={() => {
                        setActiveMainTitle(item.title);
                        onMobileClose?.();
                      }}
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group relative",
                        isSelected
                          ? "bg-white text-primary shadow-lg shadow-black/20"
                          : "text-white/60 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icon className="w-[22px] h-[22px] shrink-0" />
                      {isSelected && (
                        <div className={cn("absolute w-1.5 h-6 bg-white rounded-full", isRtl ? "-left-1.5" : "-right-1.5")} />
                      )}
                    </Link>
                  )}
                </TooltipTrigger>
                <TooltipContent side={isRtl ? "left" : "right"} sideOffset={14} className="font-semibold px-3 py-1.5 rounded-lg shadow-xl border-white/10 bg-[#0F172A] text-white">
                  {locale === "ar" ? item.titleAr : item.title}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>
    </div>
  );

  // --- Secondary Submenu Sidebar ---
  const secondarySidebar = (
    <div className={cn(
      "h-full overflow-hidden transition-[width] duration-300 ease-in-out bg-surface-2 border-r border-sidebar-border z-10 flex flex-col shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
      hasSubmenu ? "w-[240px]" : "w-0 border-r-0"
    )}>
      {activeMainItem && hasSubmenu && (
        <div className="flex flex-col h-full min-w-[240px]">
          <div className="h-16 flex items-center px-6 border-b border-sidebar-border/50 shrink-0 bg-background/50 backdrop-blur-sm">
            <h2 className="font-bold text-[15px] tracking-tight text-sidebar-fg">
              {locale === "ar" ? activeMainItem.titleAr : activeMainItem.title}
            </h2>
            {/* Mobile Close Button in Submenu Header */}
            <button
              onClick={() => onMobileClose?.()}
              className="lg:hidden ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto py-5 px-3 sidebar-scroll">
            <div className="space-y-1">
              {activeMainItem.children!.map(child => {
                const ChildIcon = getIcon(child.icon);
                const isChildActive = isActive(child.href);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={() => onMobileClose?.()}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative overflow-hidden",
                      isChildActive
                        ? "bg-white text-primary font-bold shadow-sm ring-1 ring-border/50"
                        : "text-sidebar-fg/70 hover:bg-white hover:text-sidebar-fg font-medium hover:shadow-sm hover:ring-1 hover:ring-border/50"
                    )}
                  >
                    {isChildActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary rounded-r-full" />
                    )}
                    <ChildIcon className={cn(
                      "w-[18px] h-[18px] shrink-0 transition-colors",
                      isChildActive ? "text-primary" : "text-muted-foreground group-hover:text-brand-blue"
                    )} />
                    <span className="truncate">{locale === "ar" ? child.titleAr : child.title}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* --- Desktop Layout --- */}
      <aside className="hidden lg:flex h-full transition-all duration-300 relative z-40 bg-background">
        {primarySidebar}
        {secondarySidebar}
      </aside>

      {/* --- Mobile Layout Overlay --- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => onMobileClose?.()} />

          <aside className={cn(
            "relative flex h-full max-w-[85vw] animate-in slide-in-from-left duration-300 ease-out shadow-2xl bg-background",
            isRtl && "right-0 left-auto slide-in-from-right"
          )}>
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
      className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-background hover:bg-muted shadow-sm transition-colors"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5 text-foreground" />
    </button>
  );
}
