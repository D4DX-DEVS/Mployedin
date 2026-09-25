import Link from "next/link";
import { Building2, CalendarCheck, Handshake, Network, SearchX, Sparkles, UserCheck, UserMinus, UserPlus } from "lucide-react";
import type { AgentOperations, PeopleOverview, UserRoleBucket } from "@/lib/admin/dashboard/types";
import { formatCount } from "@/lib/ui/intlFormat";
import { cardGrid, DashboardCard, DashboardSection } from "./dashboard-section";
import { shareOf, StatList } from "./stat-list";
import type { DashboardTranslator } from "./types";

const ROLE_KEYS: Record<UserRoleBucket, string> = {
  job_seeker: "jobSeeker",
  employer: "employer",
  agent: "agent",
  super_agent: "superAgent",
  other: "other",
};

/** Filter value on the users list; "other" (admins and unknown roles) has no single filter. */
const ROLE_FILTERS: Partial<Record<UserRoleBucket, string>> = {
  job_seeker: "job_seeker",
  employer: "employer",
  agent: "agent",
  super_agent: "super_agent",
};

const ROLE_BARS: Record<UserRoleBucket, string> = {
  job_seeker: "bg-sky-500",
  employer: "bg-violet-500",
  agent: "bg-emerald-500",
  super_agent: "bg-amber-500",
  other: "bg-slate-400",
};

const PACE = [
  { key: "behind", bar: "bg-rose-500" },
  { key: "onPace", bar: "bg-amber-400" },
  { key: "achieved", bar: "bg-emerald-500" },
] as const;

interface Props {
  data: PeopleOverview;
  /** Users by role needs `users`; the employer and agent cards are null without their permission. */
  showRoles: boolean;
  days: number;
  locale: string;
  t: DashboardTranslator;
}

/** This year's targets as one split bar: below target, on target, above target. */
function TargetPace({ agents, locale, t }: { agents: AgentOperations; locale: string; t: DashboardTranslator }) {
  const total = agents.targets.behind + agents.targets.onPace + agents.targets.achieved;
  return (
    <div className="mt-auto border-t border-border/60 pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{t("agents.targetsTitle", { count: total })}</p>
        <Link href={`/${locale}/admin/target-report`} className="inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:text-primary/80 sm:min-h-0">
          {t("agents.viewTargets")}
        </Link>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">{t("agents.noTargets")}</p>
      ) : (
        <>
          <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            {PACE.map(({ key, bar }) =>
              agents.targets[key] > 0 ? <span key={key} className={bar} style={{ width: `${(agents.targets[key] / total) * 100}%` }} /> : null,
            )}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {PACE.map(({ key, bar }) => (
              <li key={key} className="inline-flex items-center gap-1" data-pace={key}>
                <span className={`h-2 w-2 rounded-full ${bar}`} aria-hidden="true" />
                {t(`agents.pace.${key}`, { count: agents.targets[key] })}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Who is on the platform, how the companies behind the jobs are doing, and
 * whether the agent network is working. Subscriptions ending and jobs without
 * applications are action-queue counts and are not repeated here.
 */
export function AdminPeopleOverview({ data, showRoles, days, locale, t }: Props) {
  const { employers, agents } = data;
  const roleTotal = data.usersByRole.reduce((sum, row) => sum + row.count, 0);
  const cards = [showRoles && "roles", employers && "employers", agents && "agents"].filter(Boolean) as string[];
  const grid = cardGrid(cards.length);
  const cell = (card: string) => grid.cell(cards.indexOf(card));

  return (
    <DashboardSection
      id="admin-people"
      icon={Network}
      iconClassName="bg-emerald-100 text-emerald-800"
      title={t("people.title")}
      description={t("people.description")}
    >
      <div className={`grid items-stretch gap-3 ${grid.grid}`}>
        {showRoles && (
          <DashboardCard
            title={t("people.usersByRole")}
            subtitle={t("people.usersByRoleSubtitle", { count: roleTotal })}
            action={{ href: `/${locale}/admin/users`, label: t("people.viewUsers") }}
            className={cell("roles")}
          >
            <ul className="-mx-1 flex flex-1 flex-col justify-around">
              {data.usersByRole.map((row) => {
                const pct = roleTotal > 0 ? Math.round((row.count / roleTotal) * 100) : 0;
                const filter = ROLE_FILTERS[row.role];
                const body = (
                  <>
                    <span className="truncate text-xs text-muted-foreground">{t(`roles.${ROLE_KEYS[row.role]}`)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-secondary">
                      <span className={`block h-full rounded-full ${ROLE_BARS[row.role]}`} style={{ width: `${row.count === 0 ? 0 : Math.max(2, pct)}%` }} />
                    </span>
                    <span className="min-w-16 text-end text-xs tabular-nums text-foreground">
                      <span className="font-semibold">{formatCount(row.count)}</span>
                      <span className="ms-1 text-muted-foreground">{pct}%</span>
                    </span>
                  </>
                );
                const rowClass = "grid min-h-9 grid-cols-[6.5rem_1fr_auto] items-center gap-3 rounded-md px-1";
                return (
                  <li key={row.role} data-role={row.role}>
                    {filter ? (
                      <Link
                        href={`/${locale}/admin/users?role=${filter}`}
                        className={`${rowClass} transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={rowClass}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </DashboardCard>
        )}

        {employers && (
          <DashboardCard
            title={t("employers.title")}
            // Both populations: the sign-in rows and their shares count accounts
            // (a company can have several; some accounts have no company yet).
            subtitle={t("employers.subtitle", { companies: employers.companies, accounts: employers.accounts })}
            action={{ href: `/${locale}/admin/employers`, label: t("employers.viewEmployers") }}
            className={cell("employers")}
          >
            <StatList
              rows={[
                {
                  key: "employers-active",
                  icon: UserCheck,
                  tone: "emerald",
                  value: employers.accountsActive7d,
                  label: t("employers.active"),
                  meta: shareOf(employers.accountsActive7d, employers.accounts),
                },
                {
                  key: "employers-inactive",
                  icon: UserMinus,
                  tone: employers.accountsInactive7d > 0 ? "amber" : "slate",
                  value: employers.accountsInactive7d,
                  label: t("employers.inactive"),
                  meta: shareOf(employers.accountsInactive7d, employers.accounts),
                },
                { key: "employers-new", icon: Sparkles, tone: "sky", value: employers.newCompaniesInPeriod, label: t("employers.newCompanies", { days }) },
                {
                  key: "employers-no-active-job",
                  icon: Building2,
                  tone: "slate",
                  value: employers.withoutActiveJob,
                  label: t("employers.noActiveJob"),
                  meta: shareOf(employers.withoutActiveJob, employers.companies),
                },
                {
                  key: "employers-no-applications",
                  icon: SearchX,
                  tone: employers.activeJobsButNoApplications > 0 ? "rose" : "slate",
                  value: employers.activeJobsButNoApplications,
                  label: t("employers.noApplications"),
                },
              ]}
            />
          </DashboardCard>
        )}

        {agents && (
          <DashboardCard
            title={t("agents.title")}
            subtitle={t("agents.subtitle", { count: agents.activeAgents })}
            action={{ href: `/${locale}/admin/agents`, label: t("agents.viewAgents") }}
            className={cell("agents")}
          >
            <StatList
              rows={[
                {
                  key: "agents-no-activity",
                  icon: UserMinus,
                  tone: agents.notSignedInThisWeek > 0 ? "amber" : "slate",
                  value: agents.notSignedInThisWeek,
                  label: t("agents.noActivity"),
                  meta: shareOf(agents.notSignedInThisWeek, agents.activeAgents),
                },
                { key: "agents-sourced", icon: UserPlus, tone: "sky", value: agents.candidatesSourced, label: t("agents.candidatesSourced", { days }) },
                { key: "agents-interviews", icon: CalendarCheck, tone: "violet", value: agents.interviewsArranged, label: t("agents.interviewsArranged", { days }) },
                { key: "agents-placements", icon: Handshake, tone: "emerald", value: agents.placements, label: t("agents.placements", { days }) },
              ]}
            />
            <TargetPace agents={agents} locale={locale} t={t} />
          </DashboardCard>
        )}
      </div>
    </DashboardSection>
  );
}
