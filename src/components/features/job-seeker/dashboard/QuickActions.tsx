import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Search, FileText, Target } from "lucide-react";
// TODO: Re-add Zap when auto-apply feature is ready

interface QuickActionsProps {
  locale: string;
}

export async function QuickActions({ locale }: QuickActionsProps) {
  const t = await getTranslations("quickActions");

  const actions = [
    {
      icon: Search,
      label: t("findJobs"),
      href: "/job-seeker/jobs",
      tone: "dashboard-tone-primary",
    },
    {
      icon: FileText,
      label: t("updateResume"),
      href: "/job-seeker/cv",
      tone: "dashboard-tone-metric",
    },
    // TODO: Auto-apply quick action — re-enable when auto-apply feature is ready
    // {
    //   icon: Zap,
    //   label: "Auto Apply Settings",
    //   href: "/job-seeker/settings",
    //   color: "bg-amber-50 text-amber-600 border-amber-200",
    // },
    {
      icon: Target,
      label: t("setPreferences"),
      href: "/job-seeker/preferences",
      tone: "dashboard-tone-success",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {actions.map((action) => (
        <Link
          key={action.label}
          href={`/${locale}${action.href}`}
          className={`flex flex-col items-center gap-2 rounded-lg sm:rounded-xl border p-3 sm:p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-md ${action.tone}`}
        >
          <action.icon className="h-5 w-5" />
          <span className="text-xs font-semibold">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
