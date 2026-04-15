"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Sidebar, MobileMenuButton } from "@/components/shared/Sidebar";
import { CommandMenuTrigger } from "@/components/shared/CommandMenu";
import dynamic from "next/dynamic";

const ConversationalAI = dynamic(
  () =>
    import("@/components/shared/ConversationalAI").then((m) => m.ConversationalAI),
  { ssr: false }
);
const CommandMenu = dynamic(
  () =>
    import("@/components/shared/CommandMenu").then((m) => m.CommandMenu),
  { ssr: false }
);
const NotificationBell = dynamic(
  () =>
    import("@/components/shared/NotificationBell").then((m) => m.NotificationBell),
  { ssr: false }
);
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
  const isEmployer = userRole === "employer";
  // Defer Radix-based components to avoid SSR/client ID mismatch hydration errors
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className={`dashboard-shell h-screen overflow-hidden bg-background ${isEmployer ? "dashboard-shell-employer" : ""} ${isJobSeeker ? "flex flex-col" : "flex"}`}>
      {/* Sidebar (desktop + mobile overlay handled inside) */}
      {!isJobSeeker && (
        <Sidebar
          navGroups={navGroups}
          locale={locale}
          userRole={userRole}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          companyLogo={companyLogo}
        />
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className={`dashboard-topbar h-16 border-b border-border/40 bg-background z-30 sticky top-0 transition-all ${isEmployer ? "dashboard-topbar-employer" : ""}`}>
          <div className="flex h-full items-center gap-2 sm:gap-3 md:gap-4 px-4 sm:px-6 lg:px-8">
            {!isJobSeeker && <MobileMenuButton onClick={() => setMobileOpen(true)} />}

            {isJobSeeker && (
              <Link href={`/${locale}/job-seeker`} className="shrink-0" aria-label="Mployedin home">
                <Image
                  src="/logo.png"
                  alt="Mployedin"
                  width={140}
                  height={36}
                  className="h-9 w-auto object-contain"
                  priority
                />
              </Link>
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
        <main className={`dashboard-main flex-1 min-h-0 h-0 overflow-y-auto bg-background isolate ${isEmployer ? "dashboard-main-employer" : ""}`}>
          {children}
        </main>
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navGroups={navGroups} locale={locale} />

      {/* Floating AI assistant — employer uses RecruitmentAssistant instead */}
      {userRole !== "employer" && <ConversationalAI context={userRole === "job_seeker" ? "general_assist" : "agent_assist"} />}
    </div>
  );
}
