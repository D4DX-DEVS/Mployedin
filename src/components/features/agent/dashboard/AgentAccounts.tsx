import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { DashboardSection } from "@/components/shared/DashboardOverview";
import { UserAvatar } from "@/components/shared/UserAvatar";
import type { AssignedAccount } from "@/lib/agents/assignedAccounts";

interface AgentAccountsProps {
  rows: AssignedAccount[];
  locale: string;
}

/**
 * The employers assigned to the agent, busiest first, each with its open
 * jobs, the week's new applicants, interviews ahead and hires (client
 * feedback 2026-10-12). Same row shape as Role performance: the whole row
 * opens that employer's jobs; "View all" opens the assigned list, which
 * prints the same numbers. The count itself is the header's tile.
 */
export function AgentAccounts({ rows, locale }: AgentAccountsProps) {
  const t = useTranslations("agentDashboard.accounts");
  const tc = useTranslations("common");
  const columns = [
    { key: "openJobs", label: t("openJobs") },
    { key: "newApplicants", label: t("newApplicants") },
    { key: "upcomingInterviews", label: t("interviews") },
    { key: "hires", label: t("hires") },
  ] as const;

  return (
    <DashboardSection
      headingId="agent-accounts"
      title={t("title")}
      description={t("description")}
      action={
        <Link
          href={`/${locale}/agent/employers?view=assigned`}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:text-sm"
        >
          {t("viewAll")}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      }
    >
      {rows.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {/* One column header from `sm`; phones keep the label under each
              value instead, where a header would scroll away from it. */}
          <li aria-hidden="true" className="hidden items-center gap-3 px-4 py-2 text-[11px] font-medium text-muted-foreground sm:flex sm:px-5">
            <span className="min-w-0 flex-1">{t("account")}</span>
            <span className="grid shrink-0 grid-cols-4 gap-4 text-end">
              {columns.map((column) => (
                <span key={column.key} className="min-w-[5.5rem]">{column.label}</span>
              ))}
            </span>
            <span className="h-4 w-4 shrink-0" />
          </li>
          {rows.map((row) => (
            <li key={row.employerId}>
              <Link
                href={`/${locale}/agent/jobs?employerId=${row.employerId}`}
                className="group flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:flex-nowrap sm:px-5"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <UserAvatar name={row.companyName} className="h-7 w-7 shrink-0" />
                  <span className="truncate text-sm font-semibold text-foreground">{row.companyName}</span>
                  {!row.isActive && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {tc("inactive")}
                    </span>
                  )}
                </span>
                <ChevronRight
                  className="order-last h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 max-sm:hidden"
                  aria-hidden="true"
                />
                <dl className="grid w-full shrink-0 grid-cols-4 gap-2 sm:w-auto sm:gap-4 sm:text-end">
                  {columns.map((column) => (
                    <div key={column.key} className="sm:min-w-[5.5rem]">
                      <dt className="text-[11px] font-medium leading-tight text-muted-foreground sm:sr-only">{column.label}</dt>
                      <dd
                        className={`text-sm font-semibold tabular-nums ${row[column.key] > 0 ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {row[column.key]}
                      </dd>
                    </div>
                  ))}
                </dl>
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
