import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { DashboardSection } from "@/components/shared/DashboardOverview";

export interface AgentRoleMetric {
  jobId: string;
  title: string;
  status: string;
  applications: number;
  interviews: number;
  offers: number;
  interviewRate: number;
  offerRate: number;
}

interface AgentRolePerformanceProps {
  rows: AgentRoleMetric[];
  locale: string;
}

function statusClasses(status: string): string {
  switch (status) {
    case "active":
      return "status-active";
    case "closed":
      return "status-closed";
    case "expired":
      return "status-expired";
    default:
      return "status-draft";
  }
}

/**
 * The busiest live roles, one link row each, on the same `DashboardSection`
 * surface as the employer home's cards. It used to be a `<table>` in which
 * only the title cell was a link; the whole row opens the job now.
 */
export function AgentRolePerformance({ rows, locale }: AgentRolePerformanceProps) {
  const t = useTranslations("agentDashboard.rolePerformance");
  const tStatus = useTranslations("agentDashboard.statuses");
  const statusLabel = (status: string) =>
    ["active", "draft", "closed", "expired"].includes(status) ? tStatus(status) : tStatus("unknown");

  return (
    <DashboardSection
      headingId="agent-role-performance"
      title={t("title")}
      description={t("description")}
      action={
        <Link
          href={`/${locale}/agent/jobs`}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:text-sm"
        >
          {t("reviewAll")}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      }
    >
      {rows.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {/* One column header from `sm`; phones keep the label inside each
              row instead, where a header would scroll away from its values. */}
          <li aria-hidden="true" className="hidden items-center gap-3 px-4 py-2 text-[11px] font-medium text-muted-foreground sm:flex sm:px-5">
            <span className="min-w-0 flex-1">{t("job")}</span>
            <span className="grid shrink-0 grid-cols-3 gap-4 text-end">
              <span className="min-w-[3.5rem]">{t("applications")}</span>
              <span className="min-w-[3.5rem]">{t("interviews")}</span>
              <span className="min-w-[3.5rem]">{t("offers")}</span>
            </span>
            <span className="h-4 w-4 shrink-0" />
          </li>
          {rows.map((row) => (
            <li key={row.jobId}>
              <Link
                href={`/${locale}/agent/jobs/${row.jobId}`}
                className="group flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-5"
              >
                {/* Title and status share one line: the stacked chip made every
                    row 80px, and three rows do not need that. */}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-semibold text-foreground">{row.title}</span>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClasses(row.status)}`}
                  >
                    {statusLabel(row.status)}
                  </span>
                </span>
                <dl className="grid shrink-0 grid-cols-3 gap-3 text-end sm:gap-4">
                  <div className="sm:min-w-[3.5rem]">
                    <dt className="text-[11px] font-medium text-muted-foreground sm:sr-only">{t("applications")}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-foreground">{row.applications}</dd>
                  </div>
                  <div className="sm:min-w-[3.5rem]">
                    <dt className="text-[11px] font-medium text-muted-foreground sm:sr-only">{t("interviews")}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-foreground">
                      {row.interviews}
                      <span className="hidden text-xs font-medium text-muted-foreground 2xl:inline"> · {row.interviewRate}%</span>
                    </dd>
                  </div>
                  <div className="sm:min-w-[3.5rem]">
                    <dt className="text-[11px] font-medium text-muted-foreground sm:sr-only">{t("offers")}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-foreground">
                      {row.offers}
                      <span className="hidden text-xs font-medium text-muted-foreground 2xl:inline"> · {row.offerRate}%</span>
                    </dd>
                  </div>
                </dl>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-6 text-center sm:px-5">
          <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      )}
    </DashboardSection>
  );
}
