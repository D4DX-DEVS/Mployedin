import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock, MapPin, Video } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import { formatDate, formatTime } from "@/lib/ui/intlFormat";
import type { UpcomingInterview } from "./types";

interface Props {
  locale: string;
  interviews: UpcomingInterview[];
}

/** The next interviews in date order, with a join link when the call is online. */
export function UpcomingInterviewsPanel({ locale, interviews }: Props) {
  const t = useTranslations("jobSeekerHome");
  const href = `/${locale}/job-seeker/interviews`;
  return (
    <Panel
      id="job-seeker-interviews"
      icon={CalendarClock}
      iconClassName={interviews.length ? "bg-amber-50 text-amber-800" : "bg-primary/10 text-primary"}
      title={t("interviews.title")}
      subtitle={interviews.length ? t("interviews.subtitle", { count: interviews.length }) : t("interviews.emptyHint")}
      action={{ href, label: t("interviews.viewAll") }}
    >
      {interviews.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">{t("interviews.empty")}</p>
      ) : (
        <ul className="-mx-1 divide-y divide-border/60">
          {interviews.map((interview) => {
            const weekday = formatDate(interview.scheduledAt, { weekday: "short" }, locale);
            const dayOfMonth = formatDate(interview.scheduledAt, { day: "numeric", month: "short" }, locale);
            const time = formatTime(interview.scheduledAt, { hour: "numeric", minute: "2-digit" }, locale);
            const online = interview.type === "video" || interview.type === "hybrid";
            const Icon = online ? Video : MapPin;
            return (
              <li key={interview._id}>
                <div className="flex items-center gap-3 px-1 py-2">
                  <span className="flex h-10 min-w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 px-1.5 text-primary">
                    <span className="text-[10px] font-semibold uppercase leading-3">{weekday}</span>
                    <span className="text-xs font-bold leading-4 tabular-nums">{dayOfMonth}</span>
                  </span>
                  <Link href={href} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-sm font-medium text-foreground">{interview.jobTitle}</span>
                    <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {time} · {interview.companyName ?? t("recommendedJobs.companyFallback")} · {t(`interviews.types.${online ? (interview.type === "hybrid" ? "hybrid" : "video") : "offline"}`)}
                      </span>
                    </span>
                  </Link>
                  {interview.meetLink && online && (
                    <a
                      href={interview.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-8 shrink-0 items-center rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      {t("interviews.join")}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
