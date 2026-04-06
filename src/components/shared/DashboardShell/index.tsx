"use client";

import { useState, useEffect } from "react";
import { Sidebar, MobileMenuButton } from "@/components/shared/Sidebar";
import { CommandMenu, CommandMenuTrigger } from "@/components/shared/CommandMenu";
import { ConversationalAI } from "@/components/shared/ConversationalAI";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { UserProfileDropdown } from "@/components/shared/UserProfileDropdown";
import type { NavGroup } from "@/lib/nav/menuConfig";

interface DashboardShellProps {
  children: React.ReactNode;
  navGroups: NavGroup[];
  locale: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  lastLogin?: string;
  companyLogo?: string;
}

export function DashboardShell({
  children,
  navGroups,
  locale,
  userName,
  userEmail,
  userRole,
  lastLogin,
  companyLogo,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Defer Radix-based components to avoid SSR/client ID mismatch hydration errors
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar (desktop + mobile overlay handled inside) */}
      <Sidebar
        navGroups={navGroups}
        locale={locale}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        companyLogo={companyLogo}
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="flex h-16 items-center gap-4 border-b border-border/40 bg-background px-4 sm:px-6 lg:px-8 z-30 sticky top-0 transition-all">
          <MobileMenuButton onClick={() => setMobileOpen(true)} />
          <div className="flex-1 min-w-0">
            <CommandMenuTrigger locale={locale} />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {mounted && (
              <>
                <LanguageSwitcher />
                <NotificationBell locale={locale} />
                <UserProfileDropdown
                  userName={userName ?? "User"}
                  userEmail={userEmail ?? ""}
                  userRole={userRole ?? "job_seeker"}
                  lastLogin={lastLogin}
                  locale={locale}
                  companyLogo={companyLogo}
                />
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background isolate">
          {children}
        </main>
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navGroups={navGroups} locale={locale} />

      {/* Floating AI assistant */}
      <ConversationalAI context="general_assist" />
    </div>
  );
}
