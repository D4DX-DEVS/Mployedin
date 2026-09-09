import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import ProfileView from "@/models/ProfileView";
import Job from "@/models/Job";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import {
  buildRecommendedJobQuery,
  rankRecommendedJobs,
  HOME_RECOMMENDED_JOB_COUNT,
  RECOMMENDATION_POOL_SIZE,
  RECOMMENDED_JOB_SELECT,
} from "@/lib/jobRecommendations";
import { JobSeekerHomePage } from "@/components/features/job-seeker/home/JobSeekerHomePage";
import type { InitialHomeData } from "@/components/features/job-seeker/home/JobSeekerHomePage";
import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function JobSeekerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);

  const sessionUser = session.user as { id: string; name?: string | null; image?: string | null };
  const userId = sessionUser.id;

  await connectDB();

  // Lean query — only fields needed for the home page
  const seeker = await JobSeeker.findOne({ userId })
    .select(
      "_id userId skills preferredCountries preferredRoles preferredSalary preferredJobType " +
        "experience education languages summary profileCompleteness cvFileUrl cv " +
        "nationality currentLocation preferredLocations linkedin socialLinks"
    )
    .lean();

  if (!seeker) {
    return (
      <JobSeekerHomePage
        locale={locale}
        userName={sessionUser.name ?? undefined}
        userImage={sessionUser.image ?? undefined}
      />
    );
  }

  const seekerId = seeker._id;
  const now = new Date();

  // Dynamic imports for models that might not be available yet
  let Offer;
  let Conversation;
  try {
    Offer = await import("@/models/Offer").then(m => m.default);
  } catch {
    Offer = null;
  }
  try {
    Conversation = await import("@/models/Conversation").then(m => m.default);
  } catch {
    Conversation = null;
  }

  // The candidate pool excludes applied jobs in the query itself (same as
  // /api/jobs/recommended), so this small, indexed lookup has to resolve first.
  // Withdrawn applications don't count — those jobs stay recommendable.
  const appliedJobIds = await Application.find({
    jobSeekerId: seekerId,
    status: { $ne: "withdrawn" },
  })
    .select("jobId")
    .lean()
    .then((apps) => apps.map((a) => a.jobId));

  const countPromises: Promise<unknown>[] = [
    Application.countDocuments({ jobSeekerId: seekerId }),
    Interview.countDocuments({
      jobSeekerId: seekerId,
      scheduledAt: { $gte: now },
      status: { $nin: ["cancelled"] },
    }),
    // ProfileView.jobSeekerId holds the User id (that is what
    // GET /api/job-seekers/[id] writes), not the JobSeeker profile _id — the
    // sibling counters correctly use seekerId, this one must not.
    ProfileView.countDocuments({
      jobSeekerId: seeker.userId,
      viewedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }),
    Job.find(
      buildRecommendedJobQuery({
        preferredCountries: seeker.preferredCountries,
        excludeJobIds: appliedJobIds,
        now,
      })
    )
      // Same pool window and tiebreaker as the feed, so the four cards here are
      // the first four of the feed's page one.
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECOMMENDATION_POOL_SIZE)
      .select(RECOMMENDED_JOB_SELECT)
      .populate("employerId", "companyName logo")
      .lean(),
    Application.find({ jobSeekerId: seekerId })
      .select("jobId status createdAt")
      .populate({ path: "jobId", select: "title employerId", populate: { path: "employerId", select: "companyName logo" } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ];

  // Add optional offer count if model exists
  if (Offer) {
    countPromises.push(
      Offer.countDocuments({ jobSeekerId: seekerId, status: "pending" })
    );
  } else {
    countPromises.push(Promise.resolve(0));
  }

  // Add optional unread message count if model exists
  if (Conversation) {
    countPromises.push(
      Conversation.findOne({
        participants: new (await import("mongoose")).Types.ObjectId(seeker.userId),
        type: { $ne: "customer_care" },
      })
        .select("unreadCounts")
        .lean()
        .then((conv: unknown) => {
          const c = conv as { unreadCounts?: Record<string, number> } | null;
          if (!c?.unreadCounts) return 0;
          return Object.values(c.unreadCounts).reduce((sum, count) => sum + (count || 0), 0);
        })
        .catch(() => 0)
    );
  } else {
    countPromises.push(Promise.resolve(0));
  }

  const [appCount, interviewCount, viewCount, recentJobs, appliedApps, pendingOfferCount, unreadMessageCount] = await Promise.all(countPromises);

  const seekerProfile = await effectiveSeekerProfile(userId, seeker);

  // One ranking, shared with /api/jobs/recommended and the feed: score the
  // pool, sink off-profile jobs by a fixed penalty instead of dropping them,
  // and cut to the number of cards the page paints. The page used to run its
  // own stricter rules (hard relevance drop, score >= 30) and ship an empty
  // list the client then replaced with the API's answer — which is what made
  // the "no recommendations yet" panel flash before the cards appeared.
  const scoredJobs = rankRecommendedJobs(
    recentJobs as Array<Record<string, unknown>>,
    seekerProfile
  )
    .slice(0, HOME_RECOMMENDED_JOB_COUNT)
    // Fully serialize to plain primitives — populated subdocs still carry
    // Mongoose ObjectIds, which cannot cross the server/client boundary.
    .map((job) => {
      const emp = job.employerId as { _id?: unknown; companyName?: string; logo?: string } | null;
      const loc = job.location as { city?: string; country?: string; isRemote?: boolean } | null;
      const sal = job.salary as { min?: number; max?: number; currency?: string } | null;
      const rawDate = job.createdAt instanceof Date ? job.createdAt : new Date((job.createdAt as string) ?? 0);
      const reqs = job.requirements as { skills?: string[] } | null;
      return {
        _id: String(job._id),
        title: String(job.title ?? ""),
        createdAt: isNaN(rawDate.getTime()) ? new Date(0).toISOString() : rawDate.toISOString(),
        matchScore: job.matchScore,
        employmentType: job.employmentType ? String(job.employmentType) : undefined,
        // The card shows three skills and marks the ones the seeker already
        // has, so both the list and the overlap have to reach the client.
        skills: (reqs?.skills ?? []).map(String),
        matchedSkills: job.matchedSkills,
        location: loc
          ? { city: loc.city ?? undefined, country: loc.country ?? undefined, isRemote: loc.isRemote ?? false }
          : undefined,
        salary: sal
          ? { min: sal.min ?? undefined, max: sal.max ?? undefined, currency: sal.currency ?? undefined }
          : undefined,
        employerId: emp
          ? {
              _id: emp._id ? String(emp._id) : undefined,
              companyName: emp.companyName ?? undefined,
              logo: emp.logo ?? undefined,
            }
          : undefined,
      };
    });

  const initialData: InitialHomeData = {
    profile: JSON.parse(JSON.stringify(seeker)),
    stats: {
      applicationsSent: { count: appCount as number },
      upcomingInterviews: { count: interviewCount as number },
      recruiterViews: { total: viewCount as number },
      pendingOffers: { count: Math.max(0, Number(pendingOfferCount) || 0) },
      unreadMessages: { count: Math.max(0, Number(unreadMessageCount) || 0) },
    },
    jobs: scoredJobs,
    appliedJobs: (appliedApps as Array<Record<string, unknown>>).map((app) => {
      const job = app.jobId as Record<string, unknown> | null;
      const emp = job?.employerId as { companyName?: string; logo?: string } | null;
      const appliedDate = app.createdAt instanceof Date ? app.createdAt : new Date(String(app.createdAt ?? ""));
      return {
        _id: String(job?._id ?? ""),
        title: String(job?.title ?? ""),
        companyName: emp?.companyName ?? undefined,
        companyLogo: emp?.logo ?? undefined,
        status: String(app.status ?? "applied"),
        appliedAt: isNaN(appliedDate.getTime()) ? undefined : appliedDate.toISOString(),
      };
    })
      .filter((a) => a._id)
      // A seeker can apply to the same job twice (re-apply after rejection), and this
      // list is keyed by job id — keep the first per job or React sees duplicate keys.
      // ponytail: O(n²) on a list capped at a handful of applications.
      .filter((a, i, arr) => arr.findIndex((x) => x._id === a._id) === i),
  };

  return (
    <JobSeekerHomePage
      locale={locale}
      initialData={JSON.parse(JSON.stringify(initialData))}
      userName={sessionUser.name ?? undefined}
      userImage={sessionUser.image ?? undefined}
    />
  );
}

