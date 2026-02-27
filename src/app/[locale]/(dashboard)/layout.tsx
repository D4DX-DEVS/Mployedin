import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getNavGroups } from "@/lib/nav/menuConfig";
import { DashboardShell } from "@/components/shared/DashboardShell";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import type { UserRole } from "@/models/User";

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

  // Fetch lastLogin from DB
  await connectDB();
  const dbUser = await User.findById(session.user.id).select("lastLogin").lean();
  const lastLogin = dbUser?.lastLogin ? (dbUser.lastLogin as Date).toISOString() : undefined;

  return (
    <SessionWrapper>
      <DashboardShell
        navGroups={navGroups}
        locale={locale}
        userName={session.user.name ?? undefined}
        userEmail={session.user.email ?? undefined}
        userRole={role}
        lastLogin={lastLogin}
      >
        {children}
      </DashboardShell>
    </SessionWrapper>
  );
}
