import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BriefcaseBusiness, Building2, CalendarCheck2, Gift } from "lucide-react";
import type { WorkspaceMetric } from "@/components/shared/WorkspaceHeader";
import { AgentTodayQueue, type AgentTodayQueueLabels } from "@/components/features/agent/AgentTodayQueue";
import {
  AgentSmartHeader,
  AgentPipeline,
  AgentRolePerformance,
  type AgentRoleMetric,
} from "@/components/features/agent/dashboard";
import { getAgentActionCounts, getAgentQueueItems, resolveAgentScope, EMPTY_AGENT_COUNTS } from "@/lib/agents/workQueue";

/**
 * The agent home, on the employer home's shape: greeting header carrying the
 * four at-a-glance figures → what needs doing → the funnel → the busiest
 * roles. Every number is a link into the list it counts, no number appears
 * twice, and the whole page fits one desktop screen.
 */
export default async function AgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("agentDashboard");
  if (!session?.user) redirect(`/${locale}/login`);

  await connectDB();

  const userName = session.user.name?.split(" ")[0] ?? "there";

  const agentDoc = await Agent.findOne({ userId: session.user.id })
    .select("_id assignedEmployerIds")
    .lean();

  const agentId = agentDoc?._id;
  const employerCount = agentDoc?.assignedEmployerIds?.length ?? 0;

  // Every figure on this page is counted live. The funnel used to read the
  // `performance.*` counters on the Agent document — fire-and-forget
  // increments that only tick when a record is created through one specific
  // API path — so it showed "12 employers created" beside "22 active
  // accounts" and "0 placements" over a book with placements in it.
  let activeJobs = 0;
  let vacanciesPosted = 0;
  let totalApps = 0;
  let totalInterviews = 0;
  let totalOffers = 0;
  let interviewRate = 0;
  let offerRate = 0;
  let leadsGenerated = 0;
  let leadsConverted = 0;
  let placementsCount = 0;
  let jobMetrics: AgentRoleMetric[] = [];

  if (agentId) {
    // Portfolio scope: jobs owned directly or via assigned employers.
    const portfolioFilter = {
      $or: [
        { agentId },
        ...(agentDoc?.assignedEmployerIds?.length
          ? [{ employerId: { $in: agentDoc.assignedEmployerIds } }]
          : []),
      ],
    };
    const jobFilter = { ...portfolioFilter, deletedAt: null };

    // Portfolio-wide counts (not limited to the displayed rows).
    [activeJobs, vacanciesPosted, leadsGenerated, leadsConverted, placementsCount] = await Promise.all([
      Job.countDocuments({ ...jobFilter, status: "active" }),
      Job.countDocuments(jobFilter),
      Lead.countDocuments({ agentId }),
      Lead.countDocuments({ agentId, status: "converted" }),
      Placement.countDocuments(portfolioFilter),
    ]);

    // Per-job status counts across the ENTIRE portfolio for accurate totals
    // and rates, joined to job titles/statuses for the displayed top rows.
    const [perJobCounts, recentJobDocs] = await Promise.all([
      Application.aggregate([
        {
          $lookup: {
            from: "jobs",
            localField: "jobId",
            foreignField: "_id",
            as: "job",
            pipeline: [{ $match: jobFilter }, { $project: { _id: 1 } }],
          },
        },
        { $match: { "job.0": { $exists: true } } },
        {
          $group: {
            _id: { jobId: "$jobId", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]),
      Job.find(jobFilter)
        .select("_id title status")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const jobMap = new Map<string, Record<string, number>>();
    perJobCounts.forEach((r: { _id: { jobId: unknown; status: string }; count: number }) => {
      const jid = String(r._id.jobId);
      if (!jobMap.has(jid)) jobMap.set(jid, {});
      jobMap.get(jid)![r._id.status] = r.count;
    });

    const interviewsOf = (counts: Record<string, number>) =>
      (counts["interview_scheduled"] ?? 0) + (counts["selected"] ?? 0) + (counts["offer"] ?? 0) + (counts["hired"] ?? 0);
    const offersOf = (counts: Record<string, number>) => (counts["offer"] ?? 0) + (counts["hired"] ?? 0);

    jobMap.forEach((counts) => {
      totalApps += Object.values(counts).reduce((a, b) => a + b, 0);
      totalInterviews += interviewsOf(counts);
      totalOffers += offersOf(counts);
    });

    interviewRate = totalApps > 0 ? Math.round((totalInterviews / totalApps) * 100) : 0;
    offerRate = totalApps > 0 ? Math.round((totalOffers / totalApps) * 100) : 0;

    // The busiest live roles. A draft with no applications has no performance
    // to show and only pushed real roles off the three-row list.
    jobMetrics = recentJobDocs
      .filter((j) => j.status === "active" || jobMap.has(String(j._id)))
      .map((j) => {
        const counts = jobMap.get(String(j._id)) ?? {};
        const apps = Object.values(counts).reduce((a, b) => a + b, 0);
        const intvs = interviewsOf(counts);
        const offs = offersOf(counts);
        return {
          jobId: String(j._id),
          title: j.title as string,
          status: j.status as string,
          applications: apps,
          interviews: intvs,
          offers: offs,
          interviewRate: apps > 0 ? Math.round((intvs / apps) * 100) : 0,
          offerRate: apps > 0 ? Math.round((offs / apps) * 100) : 0,
        };
      })
      .sort((a, b) => b.applications - a.applications)
      .slice(0, 3);
  }

  // The queue replaces a three-branch guess ("any applications at all? review
  // candidates") with what is actually late. Both reads go through the same
  // module the nav badges use, so the badge and this list always agree.
  const scope = agentDoc ? await resolveAgentScope(String(session.user.id)) : null;
  const [queueItems, queueCounts] = scope
    ? await Promise.all([getAgentQueueItems(scope, 4), getAgentActionCounts(scope)])
    : [[], EMPTY_AGENT_COUNTS];

  const tQueue = await getTranslations("agentQueue");
  const queueTotal =
    queueCounts.dueFollowUps +
    queueCounts.overdueTasks +
    queueCounts.interviewsAwaitingOutcome +
    queueCounts.offersAwaitingResponse +
    queueCounts.newCandidates;
  // Strings are resolved here, not inside the panel: the shared dashboard
  // components in this codebase take copy as props, and it keeps the panel a
  // plain synchronous component.
  const queueLabels: AgentTodayQueueLabels = {
    title: tQueue("title"),
    description: queueTotal > 0 ? tQueue("titleWithCount", { count: queueTotal }) : tQueue("titleClear"),
    viewTasks: tQueue("viewTasks"),
    summary: {
      dueFollowUps: tQueue("summary.dueFollowUps"),
      overdueTasks: tQueue("summary.overdueTasks"),
      interviewsAwaitingOutcome: tQueue("summary.interviewsAwaitingOutcome"),
      offersAwaitingResponse: tQueue("summary.offersAwaitingResponse"),
      newCandidates: tQueue("summary.newCandidates"),
    },
    kind: {
      followUp: tQueue("kind.followUp"),
      task: tQueue("kind.task"),
      interviewOutcome: tQueue("kind.interviewOutcome"),
      offerResponse: tQueue("kind.offerResponse"),
      newCandidate: tQueue("kind.newCandidate"),
    },
    reason: {
      followUp: tQueue("reason.followUp"),
      task: tQueue("reason.task"),
      interviewOutcome: tQueue("reason.interviewOutcome"),
      offerResponse: tQueue("reason.offerResponse"),
      newCandidate: tQueue("reason.newCandidate"),
    },
    lateness: Object.fromEntries(
      queueItems.map((item) => [
        `${item.kind}-${item.id}`,
        item.daysLate > 0 ? tQueue("daysLate", { days: item.daysLate }) : tQueue("dueToday"),
      ]),
    ),
    emptyTitle: tQueue("empty.title"),
    emptyDescription: tQueue("empty.description"),
  };

  // Four figures the queue and the funnel do not already print: the size of
  // the book, the live roles, and how well it converts. Each opens its list.
  const metrics: WorkspaceMetric[] = [
    {
      label: t("overview.activeAccounts"),
      shortLabel: t("overview.activeAccountsShort"),
      value: employerCount,
      href: `/${locale}/agent/employers`,
      icon: Building2,
      tone: "success",
      ariaLabel: `${t("overview.activeAccounts")}: ${employerCount}`,
    },
    {
      label: t("overview.liveRoles"),
      shortLabel: t("overview.liveRolesShort"),
      value: activeJobs,
      href: `/${locale}/agent/jobs?status=active`,
      icon: BriefcaseBusiness,
      tone: "primary",
      ariaLabel: `${t("overview.liveRoles")}: ${activeJobs}`,
    },
    {
      label: t("overview.interviewRate"),
      shortLabel: t("overview.interviewRateShort"),
      value: `${interviewRate}%`,
      href: `/${locale}/agent/interviews`,
      icon: CalendarCheck2,
      tone: "warning",
      ariaLabel: `${t("overview.interviewRate")}: ${interviewRate}%`,
    },
    {
      label: t("overview.offerRate"),
      shortLabel: t("overview.offerRateShort"),
      value: `${offerRate}%`,
      href: `/${locale}/agent/offers`,
      icon: Gift,
      tone: "info",
      ariaLabel: `${t("overview.offerRate")}: ${offerRate}%`,
    },
  ];

  return (
    <div className="page-container dashboard-overview-page">
      <AgentSmartHeader
        userName={userName}
        counts={queueCounts}
        activeJobs={activeJobs}
        metrics={metrics}
        locale={locale}
      />

      <AgentTodayQueue items={queueItems} counts={queueCounts} locale={locale} labels={queueLabels} />

      {/* Two-up on wide screens: stacked, these two cost a second screen of
          scrolling. Both cards are now header + list rows — five funnel stages
          against three roles — so they stand level on their own and the grid's
          default stretch has nothing to pad. This used to carry `items-start`
          against a five-across funnel strip, which left 99px of ragged white
          under the shorter card at every width. */}
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[3fr_2fr]">
        <AgentPipeline
          leads={leadsGenerated}
          leadsConverted={leadsConverted}
          applications={totalApps}
          interviews={totalInterviews}
          interviewRate={interviewRate}
          offers={totalOffers}
          offerRate={offerRate}
          placements={placementsCount}
          locale={locale}
        />

        <AgentRolePerformance rows={jobMetrics} locale={locale} />
      </div>
    </div>
  );
}
