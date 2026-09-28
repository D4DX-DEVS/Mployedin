import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, FileText } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Panel } from "@/components/shared/DashboardKit";
import { timeAgo } from "./format";
import type { AppliedJobSnippet } from "./types";

/** Badge tint per application status; the CSS tokens are the app's status colours. */
const STATUS_CLASS: Record<string, string> = {
  applied: "text-[hsl(var(--status-applied))] bg-[hsl(var(--status-applied-bg))] border-[hsl(var(--status-applied)/0.2)]",
  shortlisted: "text-[hsl(var(--status-shortlisted))] bg-[hsl(var(--status-shortlisted-bg))] border-[hsl(var(--status-shortlisted)/0.2)]",
  interview_scheduled: "text-[hsl(var(--status-interview))] bg-[hsl(var(--status-interview-bg))] border-[hsl(var(--status-interview)/0.2)]",
  selected: "text-[hsl(var(--status-selected))] bg-[hsl(var(--status-selected-bg))] border-[hsl(var(--status-selected)/0.2)]",
  offer: "text-[hsl(var(--status-selected))] bg-[hsl(var(--status-selected-bg))] border-[hsl(var(--status-selected)/0.2)]",
  hired: "text-[hsl(var(--status-selected))] bg-[hsl(var(--status-selected-bg))] border-[hsl(var(--status-selected)/0.2)]",
  rejected: "text-[hsl(var(--status-rejected))] bg-[hsl(var(--status-rejected-bg))] border-[hsl(var(--status-rejected)/0.2)]",
  withdrawn: "text-muted-foreground bg-muted/30 border-border/60",
};

/** `statuses.*` key per status; unknown statuses read as applied. */
const STATUS_KEY: Record<string, string> = {
  applied: "applied",
  shortlisted: "shortlisted",
  interview_scheduled: "interview",
  selected: "selected",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

interface Props {
  locale: string;
  applications: AppliedJobSnippet[];
}

/** The last few applications, each with its status and what happens next. */
export function RecentApplicationsPanel({ locale, applications }: Props) {
  const t = useTranslations("jobSeekerHome");
  const href = `/${locale}/job-seeker/applications`;
  return (
    <Panel
      id="job-seeker-recent-applications"
      icon={FileText}
      title={t("recentApplications.title")}
      subtitle={t("recentApplications.subtitle")}
      action={{ href, label: t("recentApplications.viewAll") }}
    >
      {applications.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-muted-foreground">{t("recentApplications.empty")}</p>
          <Link href={`/${locale}/job-seeker/jobs`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary hover:underline">
            {t("recommendedJobs.browseJobsCta")}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ul className="-mx-1 divide-y divide-border/60">
          {applications.slice(0, 5).map((app, index) => {
            const initials = (app.companyName ?? app.title)
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            const statusKey = STATUS_KEY[app.status] ?? "applied";
            return (
              <li key={`${app._id || "app"}-${index}`}>
                <Link href={href} className="group flex items-center gap-3 px-1 py-2 transition-colors hover:bg-muted/50">
                  <Avatar className="h-9 w-9 shrink-0 rounded-xl border border-border/60 bg-muted/20">
                    <AvatarImage src={app.companyLogo ?? ""} alt={app.companyName ?? app.title} />
                    <AvatarFallback className="rounded-xl bg-primary/[0.08] text-xs font-semibold text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{app.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {app.companyName ? `${app.companyName} · ` : ""}
                      {t(`recentApplications.nextStep.${statusKey}`)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[app.status] ?? STATUS_CLASS.applied}`}>
                      {t(`statuses.${statusKey}`)}
                    </span>
                    {app.appliedAt && <span className="text-[11px] tabular-nums text-muted-foreground">{timeAgo(app.appliedAt, locale, t)}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
