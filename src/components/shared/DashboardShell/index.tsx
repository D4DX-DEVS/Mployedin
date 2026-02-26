"use client";

import { useState } from "react";
import { Sidebar, MobileMenuButton } from "@/components/shared/Sidebar";
import { CommandMenu, CommandMenuTrigger } from "@/components/shared/CommandMenu";
import { ConversationalAI } from "@/components/shared/ConversationalAI";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import type { NavGroup, NavItem } from "@/lib/nav/menuConfig";

interface DashboardShellProps {
  children: React.ReactNode;
  navGroups: NavGroup[];
  allItems: NavItem[];
  locale: string;
  userName?: string;
}

export function DashboardShell({
  children,
  navGroups,
  allItems,
  locale,
  userName,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar (desktop + mobile overlay handled inside) */}
      <Sidebar
        navGroups={navGroups}
        locale={locale}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-3 sm:px-4 lg:px-6">
          <MobileMenuButton onClick={() => setMobileOpen(true)} />
          <div className="flex-1 min-w-0">
            <CommandMenuTrigger />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSwitcher />
            <NotificationBell locale={locale} />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-sm font-semibold shrink-0">
              {userName?.charAt(0).toUpperCase() ?? "U"}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navItems={allItems} locale={locale} />

      {/* Floating AI assistant */}
      <ConversationalAI context="general_assist" />
    </div>
  );
}
