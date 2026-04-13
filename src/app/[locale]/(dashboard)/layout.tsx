import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getNavGroups } from "@/lib/nav/menuConfig";
import { DashboardShell } from "@/components/shared/DashboardShell";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { CsrfProvider } from "@/components/shared/CsrfProvider";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/models/User";
import { DashboardProviders } from "@/components/shared/DashboardProviders";
import { RecruitmentAssistant } from "@/components/features/employer/RecruitmentAssistant";

/**
 * Per-request cached DB look-up for the logged-in user's shell data.
 * React's `cache()` deduplicates calls within the same server render tree
 * so nested layouts and pages that call this don't trigger extra DB round-trips.
 */
const getShellData = cache(async (userId: string, role: UserRole) => {
  await connectDB();
  const [dbUser, dbEmployer] = await Promise.all([
    User.findById(userId).select("lastLogin").lean(),
    role === "employer"
      ? Employer.findOne({ userId }).select("logo").lean()
      : Promise.resolve(null),
  ]);
  return {
    lastLogin: dbUser?.lastLogin ? (dbUser.lastLogin as Date).toISOString() : undefined,
    companyLogo: (dbEmployer as { logo?: string } | null)?.logo ?? undefined,
  };
});

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const session = await auth();
  const { locale: paramLocale } = await params;
  if (!session?.user) {
    redirect(`/${paramLocale}/login`);
  }

  const role = (session.user as { role: UserRole }).role;
  // Always use the URL locale so LanguageSwitcher changes take effect immediately
  const locale = paramLocale;

  const navGroups = getNavGroups(role, locale);

  const { lastLogin, companyLogo } = await getShellData(session.user.id as string, role);

  return (
    <SessionWrapper>
      <CsrfProvider>
        <DashboardProviders>
          <DashboardShell
            navGroups={navGroups}
            locale={locale}
            userName={session.user.name ?? undefined}
            userEmail={session.user.email ?? undefined}
            userRole={role}
            lastLogin={lastLogin}
            companyLogo={companyLogo}
          >
            {children}
          </DashboardShell>
          {/* Recruitment AI assistant — employer-only floating panel */}
          {role === "employer" && <RecruitmentAssistant />}
        </DashboardProviders>
      </CsrfProvider>
    </SessionWrapper>
  );
}
