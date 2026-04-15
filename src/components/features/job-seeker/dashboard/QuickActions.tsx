import Link from "next/link";
import { Search, FileText, Target } from "lucide-react";
// TODO: Re-add Zap when auto-apply feature is ready

interface QuickActionsProps {
  locale: string;
}

const actions = [
  {
    icon: Search,
    label: "Find Jobs",
    href: "/job-seeker/jobs",
    tone: "dashboard-tone-primary",
  },
  {
    icon: FileText,
    label: "Update Resume",
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
    label: "Set Preferences",
    href: "/job-seeker/preferences",
    tone: "dashboard-tone-success",
  },
];

export function QuickActions({ locale }: QuickActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map((action) => (
        <Link
          key={action.label}
          href={`/${locale}${action.href}`}
          className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-md ${action.tone}`}
        >
          <action.icon className="h-5 w-5" />
          <span className="text-xs font-semibold">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
