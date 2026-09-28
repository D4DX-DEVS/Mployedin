import { useTranslations } from "next-intl";
import { Briefcase, CalendarClock, FolderHeart, Sparkles, Users } from "lucide-react";
import { QuickActions, type QuickAction } from "@/components/shared/DashboardKit";

interface EmployerHeaderProps {
  userName: string;
  locale: string;
}

/**
 * Dashboard header: greeting, one line of purpose and the verbs an employer
 * comes here to do. Paths mirror `WORKSPACE_QUICK_ACTIONS.employer` and the
 * employer sidebar so the same destinations are reachable from every page.
 */
export function EmployerHeader({ userName, locale }: EmployerHeaderProps) {
  const t = useTranslations("employerDashboard");
  const p = (path: string) => `/${locale}${path}`;

  const actions: QuickAction[] = [
    { key: "postJob", label: t("overview.actions.postJob"), href: p("/employer/jobs/new?mode=manual"), icon: Briefcase, primary: true },
    { key: "postJobAi", label: t("overview.actions.postJobAi"), href: p("/employer/jobs/ai-create"), icon: Sparkles },
    { key: "candidates", label: t("overview.actions.candidates"), href: p("/employer/candidates"), icon: Users },
    { key: "interviews", label: t("overview.actions.interviews"), href: p("/employer/interviews"), icon: CalendarClock },
    { key: "talentPool", label: t("overview.actions.talentPool"), href: p("/employer/talent-pools"), icon: FolderHeart },
  ];

  return (
    <header className="flex flex-col gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {t("smartHeader.welcomeBack", { userName })}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("overview.subtitle")}</p>
      </div>
      <QuickActions actions={actions} ariaLabel={t("overview.actions.label")} />
    </header>
  );
}
