import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BellRing, FileText, MessageSquare, Search } from "lucide-react";
import { ProgressRing, QuickActions, type QuickAction } from "@/components/shared/DashboardKit";
import { formatCount } from "@/lib/ui/intlFormat";
import { Greeting } from "./greeting";

interface HomeHeaderProps {
  locale: string;
  userName?: string;
  /** 0–100; null while the profile is still loading. */
  completion: number | null;
  missing: number;
}

/**
 * Greeting, profile-completeness ring with its one CTA, and the four things a
 * seeker most often comes here to do.
 */
export function HomeHeader({ locale, userName, completion, missing }: HomeHeaderProps) {
  const t = useTranslations("jobSeekerHome");
  const name = userName ?? t("defaults.jobSeekerName");
  const p = (path: string) => `/${locale}${path}`;
  const complete = completion !== null && completion >= 100;
  const pct = formatCount(completion ?? 0, undefined, locale);

  const actions: QuickAction[] = [
    { key: "findJobs", label: t("header.findJobs"), href: p("/job-seeker/jobs"), icon: Search, primary: true },
    { key: "buildCv", label: t("header.buildCv"), href: p("/job-seeker/cv"), icon: FileText },
    { key: "jobAlerts", label: t("quickLinks.jobAlerts"), href: p("/job-seeker/saved-searches"), icon: BellRing },
    { key: "messages", label: t("header.messages"), href: p("/job-seeker/messages"), icon: MessageSquare },
  ];

  return (
    <header className="flex flex-col gap-3" data-testid="job-seeker-home-header">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Greeting
            className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            labels={{
              hello: t("greeting.hello", { name }),
              morning: t("greeting.morning", { name }),
              afternoon: t("greeting.afternoon", { name }),
              evening: t("greeting.evening", { name }),
            }}
          />
          <p className="mt-0.5 text-sm text-muted-foreground">{t("greeting.subtitle")}</p>
        </div>

        {completion !== null && (
          <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 pe-4 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.36)] sm:max-w-sm">
            <ProgressRing
              value={completion}
              size={72}
              strokeWidth={7}
              valueLabel={`${pct}%`}
              label={t("profileMini.complete")}
              color={complete ? "#1baf7a" : "#0242CE"}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{complete ? t("header.profileComplete") : t("profileCard.profileCompleteness")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {complete ? t("profileMini.allDone") : t("header.missingDetails", { count: missing })}
              </p>
              <Link
                href={p("/job-seeker/profile")}
                className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
              >
                {complete ? t("header.viewProfile") : t("header.completeProfile")}
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </div>
      <QuickActions actions={actions} ariaLabel={t("header.quickActionsLabel")} />
    </header>
  );
}
