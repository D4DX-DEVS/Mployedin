import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BriefcaseBusiness, Building2, Crown, Handshake, Users } from "lucide-react";
import type { WorkspaceMetric } from "@/components/shared/WorkspaceHeader";
import { AgentTodayQueue, type AgentTodayQueueLabels } from "@/components/features/agent/AgentTodayQueue";
import {
  AgentAccounts,
  AgentSmartHeader,
  AgentPipeline,
  AgentRolePerformance,
  AgentTalentSpotlight,
  type AgentRoleMetric,
  type SpotlightSeeker,
} from "@/components/features/agent/dashboard";
import { getAgentActionCounts, getAgentQueueItems, resolveAgentScope, EMPTY_AGENT_COUNTS } from "@/lib/agents/workQueue";
import { resolveAssignedRegions } from "@/lib/agents/assignedRegion";
import { loadSuperAgentContact } from "@/lib/agents/superAgentContact";
import { loadAssignedAccounts } from "@/lib/agents/assignedAccounts";
import { getAgentEmployerIds, getAgentSeekerArea, seekerRegionMatch } from "@/lib/auth/agentRestrictions";
import { buildBroughtInFilter } from "@/lib/jobseekers/onboarded";
import { leadPeriodFilter } from "@/lib/leads/period";
import { isValidTimeZone } from "@/lib/datetime/zone";
import { localHourIn } from "@/lib/datetime/countryZone";

interface SpotlightSeekerDoc {
  _id: unknown;
  userId?: { name?: string; email?: string } | null;
  currentLocation?: string;
  experience?: { jobTitle?: string; isCurrent?: boolean }[];
  badges?: string[];
  referral?: unknown;
  createdAt?: Date;
}

function toSpotlightSeeker(doc: SpotlightSeekerDoc): SpotlightSeeker {
  const title = doc.experience?.find((e) => e.isCurrent)?.jobTitle;
  return {
    id: String(doc._id),
    name: doc.userId?.name ?? "—",
    email: doc.userId?.email ?? "",
    subtitle: title || doc.currentLocation || undefined,
    premium: (doc.badges ?? []).includes("premium"),
    referred: Boolean(doc.referral),
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
  };
}

/**
 * The agent home, on the employer home's shape: greeting header carrying the
 * at-a-glance figures → what needs doing → the funnel → the busiest
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
    .select("_id assignedEmployerIds assignedCityIds assignedStateIds assignedJobSeekerIds superAgentId timezone currencyCode")
    .lean();

  // Greeting by the agent's own clock, as on the super-agent home.
  const now = new Date();
  const timeZone = isValidTimeZone(agentDoc?.timezone) ? (agentDoc!.timezone as string) : "Asia/Dubai";
  const hour = localHourIn(timeZone, now);
  const greeting = t(
    hour < 12 ? "smartHeader.greetingMorning" : hour < 17 ? "smartHeader.greetingAfternoon" : "smartHeader.greetingEvening",
    { userName },
  );

  // The region an admin assigned and the super agent they report to, named
  // for the header pills; and the accounts assigned to the agent, with their
  // numbers. The accounts tile used to count every active employer in the
  // agent's region (client feedback 2026-10-12): it counts the assigned ones
  // now, archived profiles left out; the tile counts active logins only.
  const [assignedRegions, superAgent, accounts] = await Promise.all([
    resolveAssignedRegions(agentDoc, locale),
    loadSuperAgentContact((agentDoc as { superAgentId?: unknown } | null)?.superAgentId),
    loadAssignedAccounts(((agentDoc?.assignedEmployerIds as unknown[] | undefined) ?? []), now, 5),
  ]);

  const agentId = agentDoc?._id;
  // Employers the agent sees — assigned, or registered in their region.
  const visibleEmployerIds = agentId ? await getAgentEmployerIds(String(session.user.id)) : [];

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
  let leadsConvertedToday = 0;
  let activeLeadsThisWeek = 0;
  let placementsCount = 0;
  let onboardedSeekers = 0;
  let premiumCandidates = 0;
  let onboardedPremium = 0;
  let recentOnboarded: SpotlightSeeker[] = [];
  let recentPremium: SpotlightSeeker[] = [];
  let jobMetrics: AgentRoleMetric[] = [];

  if (agentId) {
    // Portfolio scope: jobs owned directly or via the employers the agent sees.
    const portfolioFilter = {
      $or: [
        { agentId },
        ...(visibleEmployerIds.length > 0
          ? [{ employerId: { $in: visibleEmployerIds } }]
          : []),
      ],
    };
    const jobFilter = { ...portfolioFilter, deletedAt: null };

    // Portfolio-wide counts (not limited to the displayed rows).
    // Seeker counts reuse the /api/job-seekers scope (own + referred +
    // assigned + area) so the dashboard metric equals the list it opens.
    const seekerArea = await getAgentSeekerArea({
      assignedCityIds: (agentDoc?.assignedCityIds as never[] | undefined) ?? [],
      assignedStateIds: (agentDoc?.assignedStateIds as never[] | undefined) ?? [],
      superAgentId: (agentDoc as { superAgentId?: unknown } | null)?.superAgentId,
    });
    const seekerAreaMatch = seekerRegionMatch(seekerArea);
    const assignedSeekerIds = ((agentDoc as { assignedJobSeekerIds?: unknown[] } | null)?.assignedJobSeekerIds ?? []) as import("mongoose").Types.ObjectId[];
    // "Onboarded" = the seekers this agent brought in: created by them, joined
    // through their referral link, or assigned to them. Counted from sign-up,
    // not from the seeker finishing their own profile (`isOnboarded`), so a
    // link sign-up shows at once. Area-only seekers are not theirs.
    const broughtIn = buildBroughtInFilter(agentId, assignedSeekerIds);
    const seekerOr: Record<string, unknown>[] = [...((broughtIn.$or as Record<string, unknown>[]) ?? [])];
    if (seekerAreaMatch) seekerOr.push(seekerAreaMatch);
    const seekerScope = { roleArchivedAt: null, $or: seekerOr };
    // The three newest of each, for the spotlight's "latest" rows.
    const recentSeekers = (scope: Record<string, unknown>, filter: Record<string, unknown> = {}) =>
      JobSeeker.find({ ...scope, ...filter })
        .sort({ createdAt: -1 })
        .limit(3)
        .select("userId currentLocation experience badges referral createdAt")
        .populate("userId", "name email")
        .lean<SpotlightSeekerDoc[]>();
    let onboardedDocs: SpotlightSeekerDoc[];
    let premiumDocs: SpotlightSeekerDoc[];
    [activeJobs, vacanciesPosted, leadsGenerated, leadsConverted, leadsConvertedToday, activeLeadsThisWeek, placementsCount, onboardedSeekers, premiumCandidates, onboardedPremium, onboardedDocs, premiumDocs] = await Promise.all([
      Job.countDocuments({ ...jobFilter, status: "active" }),
      Job.countDocuments(jobFilter),
      Lead.countDocuments({ agentId }),
      Lead.countDocuments({ agentId, status: "converted" }),
      // Same query /api/leads?period= runs, in the agent's own day and week.
      Lead.countDocuments({ agentId, ...leadPeriodFilter("converted_today", timeZone, now) }),
      Lead.countDocuments({ agentId, ...leadPeriodFilter("active_week", timeZone, now) }),
      Placement.countDocuments(portfolioFilter),
      JobSeeker.countDocuments(broughtIn),
      JobSeeker.countDocuments({ ...seekerScope, badges: "premium" }),
      JobSeeker.countDocuments({ ...broughtIn, badges: "premium" }),
      recentSeekers(broughtIn),
      recentSeekers(seekerScope, { badges: "premium" }),
    ]);
    recentOnboarded = onboardedDocs.map(toSpotlightSeeker);
    recentPremium = premiumDocs.map(toSpotlightSeeker);

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
    queueCounts.newCandidates +
    (queueCounts.exhibitionRevisions ?? 0);
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
      exhibitionRevisions: tQueue("summary.exhibitionRevisions"),
    },
    kind: {
      followUp: tQueue("kind.followUp"),
      task: tQueue("kind.task"),
      interviewOutcome: tQueue("kind.interviewOutcome"),
      offerResponse: tQueue("kind.offerResponse"),
      newCandidate: tQueue("kind.newCandidate"),
      exhibitionRevision: tQueue("kind.exhibitionRevision"),
    },
    reason: {
      followUp: tQueue("reason.followUp"),
      task: tQueue("reason.task"),
      interviewOutcome: tQueue("reason.interviewOutcome"),
      offerResponse: tQueue("reason.offerResponse"),
      newCandidate: tQueue("reason.newCandidate"),
      exhibitionRevision: tQueue("reason.exhibitionRevision"),
    },
    lateness: Object.fromEntries(
      queueItems.map((item) => [
        `${item.kind}-${item.id}`,
        // A sent-back request is not "late"; say how long it has waited.
        item.kind === "exhibitionRevision"
          ? tQueue("sentBackAgo", { days: item.daysLate })
          : item.daysLate > 0 ? tQueue("daysLate", { days: item.daysLate }) : tQueue("dueToday"),
      ]),
    ),
    emptyTitle: tQueue("empty.title"),
    emptyDescription: tQueue("empty.description"),
  };

  // At-a-glance figures the queue and the funnel do not already print. Each
  // opens the list it counts. Target and commission are header links with no
  // figure (client feedback 2026-10-23: no money or target numbers on home).
  const metrics: WorkspaceMetric[] = [
    {
      label: t("overview.activeAccounts"),
      shortLabel: t("overview.activeAccountsShort"),
      // Distinct assigned employers whose login is active (client feedback
      // 2026-10-14: "Active employers", the assigned number).
      value: accounts.active,
      href: `/${locale}/agent/employers?view=assigned&status=active`,
      icon: Building2,
      tone: "success",
      ariaLabel: `${t("overview.activeAccounts")}: ${accounts.active}`,
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
      label: t("overview.leadsConvertedToday"),
      shortLabel: t("overview.leadsConvertedTodayShort"),
      value: leadsConvertedToday,
      href: `/${locale}/agent/leads?period=converted_today`,
      icon: Handshake,
      tone: "success",
      ariaLabel: `${t("overview.leadsConvertedToday")}: ${leadsConvertedToday}`,
    },
    {
      label: t("overview.activeLeadsWeek"),
      shortLabel: t("overview.activeLeadsWeekShort"),
      value: activeLeadsThisWeek,
      href: `/${locale}/agent/leads?period=active_week`,
      icon: Users,
      tone: "info",
      ariaLabel: `${t("overview.activeLeadsWeek")}: ${activeLeadsThisWeek}`,
    },
    {
      label: t("overview.premiumCandidates"),
      shortLabel: t("overview.premiumCandidatesShort"),
      // The Talent card's Premium count and the list it opens.
      value: premiumCandidates,
      href: `/${locale}/agent/job-seekers?premium=1`,
      icon: Crown,
      tone: "warning",
      ariaLabel: `${t("overview.premiumCandidates")}: ${premiumCandidates}`,
    },
  ];

  return (
    <div className="page-container dashboard-overview-page">
      <AgentSmartHeader
        greeting={greeting}
        counts={queueCounts}
        activeJobs={activeJobs}
        regions={assignedRegions}
        superAgent={superAgent}
        metrics={metrics}
        locale={locale}
      />

      <AgentTodayQueue items={queueItems} counts={queueCounts} locale={locale} labels={queueLabels} />

      <AgentAccounts rows={accounts.rows} locale={locale} />

      <AgentTalentSpotlight
        onboarded={onboardedSeekers}
        onboardedPremium={onboardedPremium}
        premium={premiumCandidates}
        recentOnboarded={recentOnboarded}
        recentPremium={recentPremium}
        locale={locale}
      />

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
