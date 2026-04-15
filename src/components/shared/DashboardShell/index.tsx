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
import PublicFooter from "@/components/shared/PublicFooter";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
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
    <div className={`dashboard-shell bg-background ${isEmployer ? "dashboard-shell-employer" : ""} ${isJobSeeker ? "flex min-h-screen flex-col" : "flex h-screen overflow-hidden"}`}>
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
      <div className={`flex flex-1 flex-col min-w-0 ${isJobSeeker ? "" : "min-h-0 overflow-hidden"}`}>
        {/* Topbar */}
        <header className={`dashboard-topbar border-b border-border/40 bg-background z-30 sticky top-0 transition-all ${isEmployer ? "dashboard-topbar-employer h-20" : isJobSeeker ? "h-20" : "h-16"}`}>
          <div className="flex h-full items-center gap-2 sm:gap-3 md:gap-4 px-4 sm:px-6 lg:px-8">
            {!isJobSeeker && <MobileMenuButton onClick={() => setMobileOpen(true)} />}

            {isJobSeeker && (
              <Link href={`/${locale}/job-seeker`} className="shrink-0" aria-label="Mployedin home">
                <Image
                  src="/logo.png"
                  alt="Mployedin"
                  width={176}
                  height={48}
                  className="h-12 w-auto object-contain"
                  style={{ width: "auto" }}
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
                  <ThemeToggle />
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
        {isJobSeeker ? (
          <>
            <main className="dashboard-main isolate flex-1 bg-background">
              {children}
            </main>
            <div className="flex-shrink-0 pt-8">
              <PublicFooter locale={locale} variant="embedded" />
            </div>
          </>
        ) : (
          <main className={`dashboard-main isolate min-h-0 flex flex-1 flex-col overflow-y-auto bg-background ${isEmployer ? "dashboard-main-employer" : ""}`}>
            <div>
              {children}
            </div>
          </main>
        )}
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navGroups={navGroups} locale={locale} />

      {/* Floating AI assistant — employer uses RecruitmentAssistant instead */}
      {userRole !== "employer" && <ConversationalAI context={userRole === "job_seeker" ? "general_assist" : "agent_assist"} />}
    </div>
  );
}
