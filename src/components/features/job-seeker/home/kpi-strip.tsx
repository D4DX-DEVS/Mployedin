import { useTranslations } from "next-intl";
import { KpiTile } from "@/components/shared/DashboardKit";
import { formatCount } from "@/lib/ui/intlFormat";
import { weekDelta } from "./format";
import type { DashboardStats } from "./types";

interface Props {
  locale: string;
  stats: DashboardStats;
}

/** Six headline numbers: the seeker's pipeline, recruiter interest and what is waiting on them. */
export function SeekerKpiStrip({ locale, stats }: Props) {
  const t = useTranslations("jobSeekerHome");
  const p = (path: string) => `/${locale}${path}`;
  const n = (value: number | undefined) => formatCount(value ?? 0, undefined, locale);

  const apps = weekDelta(stats.applicationsSent?.delta, t);
  const interviews = weekDelta(stats.upcomingInterviews?.delta, t);
  const views = weekDelta(stats.recruiterViews?.delta, t);
  const appsSpark = stats.applicationsSent?.daily;
  const viewsSpark = stats.recruiterViews?.last7Days;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-kpi-strip>
      <KpiTile
        label={t("kpi.applications")}
        value={n(stats.applicationsSent?.count)}
        hint={t("kpi.applicationsHint")}
        delta={apps.text}
        deltaDirection={apps.direction}
        deltaLabel={apps.label}
        spark={appsSpark}
        icon="applications"
        href={p("/job-seeker/applications")}
      />
      <KpiTile
        label={t("kpi.interviews")}
        value={n(stats.upcomingInterviews?.count)}
        hint={t("kpi.interviewsHint")}
        delta={interviews.text}
        deltaDirection={interviews.direction}
        deltaLabel={interviews.label}
        icon="interviews"
        href={p("/job-seeker/interviews")}
      />
      <KpiTile
        label={t("kpi.views")}
        value={n(stats.recruiterViews?.total)}
        hint={t("kpi.viewsHint")}
        delta={views.text}
        deltaDirection={views.direction}
        deltaLabel={views.label}
        spark={viewsSpark}
        icon="views"
        href={p("/job-seeker/profile")}
        color="#1baf7a"
      />
      <KpiTile
        label={t("kpi.offers")}
        value={n(stats.pendingOffers?.count)}
        hint={t("kpi.offersHint")}
        icon="placements"
        href={p("/job-seeker/offers")}
      />
      <KpiTile
        label={t("kpi.messages")}
        value={n(stats.unreadMessages?.count)}
        hint={t("kpi.messagesHint")}
        icon="messages"
        href={p("/job-seeker/messages")}
      />
      <KpiTile
        label={t("kpi.alerts")}
        value={n(stats.jobAlerts?.count)}
        hint={t("kpi.alertsHint")}
        icon="jobs"
        href={p("/job-seeker/saved-searches")}
      />
    </div>
  );
}
