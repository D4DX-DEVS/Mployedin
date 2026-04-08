"use client";

import { useState, useEffect } from "react";
import { Sidebar, MobileMenuButton } from "@/components/shared/Sidebar";
import { CommandMenu, CommandMenuTrigger } from "@/components/shared/CommandMenu";
import { ConversationalAI } from "@/components/shared/ConversationalAI";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { UserProfileDropdown } from "@/components/shared/UserProfileDropdown";
import { JobSeekerTopNav, JobSeekerTopNavMobile } from "@/components/shared/JobSeekerTopNav";
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
  const isJobSeeker = userRole === "job_seeker";
  // Defer Radix-based components to avoid SSR/client ID mismatch hydration errors
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className={`h-screen overflow-hidden bg-background ${isJobSeeker ? "flex flex-col" : "flex"}`}>
      {/* Sidebar (desktop + mobile overlay handled inside) */}
      {!isJobSeeker && (
        <Sidebar
          navGroups={navGroups}
          locale={locale}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          companyLogo={companyLogo}
        />
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-border/40 bg-background z-30 sticky top-0 transition-all">
          <div className="flex h-full items-center gap-4 px-4 sm:px-6 lg:px-8">
            {!isJobSeeker && <MobileMenuButton onClick={() => setMobileOpen(true)} />}

            {isJobSeeker && (
              <div className="shrink-0 font-semibold text-lg tracking-tight text-primary">
                Mployedin
              </div>
            )}

            {isJobSeeker && <JobSeekerTopNav locale={locale} />}

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
          </div>
        </header>
        {isJobSeeker && <JobSeekerTopNavMobile locale={locale} />}

        {/* Page content */}
        <main className="flex-1 min-h-0 h-0 overflow-y-auto bg-background isolate">
          {children}
        </main>
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navGroups={navGroups} locale={locale} />

      {/* Floating AI assistant — hidden for employer role (they use RecruitmentAssistant instead) */}
      {userRole !== "employer" && userRole !== "job_seeker" && <ConversationalAI context="general_assist" />}
    </div>
  );
}
