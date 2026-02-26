import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getNavGroups, getAllNavItems } from "@/lib/nav/menuConfig";
import { Sidebar } from "@/components/shared/Sidebar";
import { CommandMenu } from "@/components/shared/CommandMenu";
import { ConversationalAI } from "@/components/shared/ConversationalAI";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { CommandMenuTrigger } from "@/components/shared/CommandMenu";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
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
  const locale = (session.user as { locale: string }).locale ?? paramLocale;

  const navGroups = getNavGroups(role, locale);
  const allItems = getAllNavItems(role, locale);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar navGroups={navGroups} locale={locale} />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-4 lg:px-6">
          <div className="flex-1">
            <CommandMenuTrigger />
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell locale={locale} />
            {/* Avatar / user menu */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-sm font-semibold">
              {session.user.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navItems={allItems} locale={locale} />

      {/* Floating AI assistant */}
      <ConversationalAI context="general_assist" />
    </div>
  );
}
