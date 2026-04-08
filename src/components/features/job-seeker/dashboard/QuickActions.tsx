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
    color: "bg-blue-50 text-blue-600 border-blue-200",
  },
  {
    icon: FileText,
    label: "Update Resume",
    href: "/job-seeker/cv",
    color: "bg-purple-50 text-purple-600 border-purple-200",
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
    color: "bg-green-50 text-green-600 border-green-200",
  },
];

export function QuickActions({ locale }: QuickActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map((action) => (
        <Link
          key={action.label}
          href={`/${locale}${action.href}`}
          className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5 ${action.color}`}
        >
          <action.icon className="h-5 w-5" />
          <span className="text-xs font-semibold">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
