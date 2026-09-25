import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import TargetProfile from "@/models/TargetProfile";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BriefcaseBusiness, Building2, Goal, Wallet } from "lucide-react";
import type { WorkspaceMetric } from "@/components/shared/WorkspaceHeader";
import { AgentTodayQueue, type AgentTodayQueueLabels } from "@/components/features/agent/AgentTodayQueue";
import {
  AgentSmartHeader,
  AgentPipeline,
  AgentRolePerformance,
  type AgentRoleMetric,
} from "@/components/features/agent/dashboard";
import { getAgentActionCounts, getAgentQueueItems, resolveAgentScope, EMPTY_AGENT_COUNTS } from "@/lib/agents/workQueue";
import { resolveAssignedRegions } from "@/lib/agents/assignedRegion";
import { calculateMonthlyAchievements } from "@/lib/targets/profileAchievementCalculator";
import { formatCurrency } from "@/lib/currency";
import { isValidTimeZone } from "@/lib/datetime/zone";
import { localHourIn } from "@/lib/datetime/countryZone";

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
    .select("_id assignedEmployerIds assignedCityIds assignedStateIds timezone currencyCode")
    .lean();

  // Greeting by the agent's own clock, as on the super-agent home.
  const now = new Date();
  const timeZone = isValidTimeZone(agentDoc?.timezone) ? (agentDoc!.timezone as string) : "Asia/Dubai";
  const hour = localHourIn(timeZone, now);
  const greeting = t(
    hour < 12 ? "smartHeader.greetingMorning" : hour < 17 ? "smartHeader.greetingAfternoon" : "smartHeader.greetingEvening",
    { userName },
  );

  // The region an admin assigned, named for the header pill.
  const assignedRegions = await resolveAssignedRegions(agentDoc, locale);

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
      // Live roles only, across the whole portfolio. This read took the 20
      // newest jobs of any status, so "How each live role is converting"
      // listed closed roles and missed a busy live role posted earlier.
      Job.find({ ...jobFilter, status: "active" })
        .select("_id title status")
        .sort({ createdAt: -1 })
        .limit(200)
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

    // The three busiest live roles.
    jobMetrics = recentJobDocs
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

  // ── This month: the target the super-agent split to this agent, and the
  // commission booked against it. "This month" is the server's calendar month
  // because the target report and the commissions page both count that way,
  // and each card must equal the page it opens.
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthFrom = `${year}-${pad(month)}-01`;
  const monthTo = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  let targetProgress: number | null = null;
  let commissionThisMonth = 0;
  if (agentId) {
    // /api/commissions reads ?dateFrom/?dateTo exactly like this.
    const commissionFrom = new Date(monthFrom);
    const commissionTo = new Date(monthTo);
    commissionTo.setHours(23, 59, 59, 999);
    const [targetProfile, commissionRows] = await Promise.all([
      // The same profile /api/agent/target-report reads.
      TargetProfile.findOne({ assigneeId: session.user.id, assigneeRole: "agent", year, status: "active" })
        .select("monthlyTargets")
        .lean<{ monthlyTargets?: { month: number; employerTarget: number; employeeTarget: number; financeTarget: number }[] } | null>(),
      // Pending + approved + paid: the three cards on the commissions page.
      // Override lines carry only superAgentId, so agentId is this agent's own.
      Commission.aggregate<{ total: number }>([
        { $match: { agentId, createdAt: { $gte: commissionFrom, $lte: commissionTo }, status: { $in: ["pending", "approved", "paid"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);
    commissionThisMonth = commissionRows[0]?.total ?? 0;
    const monthTarget = targetProfile?.monthlyTargets?.find((m) => m.month === month);
    if (monthTarget && (monthTarget.employerTarget > 0 || monthTarget.employeeTarget > 0 || monthTarget.financeTarget > 0)) {
      const [achievement] = await calculateMonthlyAchievements(String(session.user.id), "agent", year, [monthTarget]);
      targetProgress = achievement?.overallProgress ?? 0;
    }
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
  // the book, the live roles, this month's target and commission. (The two
  // conversion rates used to sit here too, repeating the pipeline's
  // "25% of applicants".) Each opens the list it counts.
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
      label: t("overview.targetThisMonth"),
      shortLabel: t("overview.targetShort"),
      value: targetProgress === null ? "—" : `${targetProgress}%`,
      href: `/${locale}/agent/target-report`,
      icon: Goal,
      tone: "warning",
      ariaLabel: targetProgress === null
        ? `${t("overview.targetThisMonth")}: ${t("overview.targetNotSet")}`
        : `${t("overview.targetThisMonth")}: ${targetProgress}%`,
    },
    {
      label: t("overview.commissionThisMonth"),
      shortLabel: t("overview.commissionShort"),
      value: formatCurrency(commissionThisMonth, agentDoc?.currencyCode ?? "AED"),
      href: `/${locale}/agent/commissions?dateFrom=${monthFrom}&dateTo=${monthTo}`,
      icon: Wallet,
      tone: "info",
      ariaLabel: `${t("overview.commissionThisMonth")}: ${formatCurrency(commissionThisMonth, agentDoc?.currencyCode ?? "AED")}`,
    },
  ];

  return (
    <div className="page-container dashboard-overview-page">
      <AgentSmartHeader
        greeting={greeting}
        counts={queueCounts}
        activeJobs={activeJobs}
        regions={assignedRegions}
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
