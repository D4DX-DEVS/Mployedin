import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import ProfileView from "@/models/ProfileView";
// Registered for the recent-applications populate (jobId → Job → employerId).
import "@/models/Job";
import "@/models/Employer";
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

  // Lean query — the profile the client paints. Scoring no longer happens here
  // (the job cards come from /api/jobs/recommended), so this list is no longer
  // tied to SEEKER_MATCH_FIELDS.
  const seeker = await JobSeeker.findOne({ userId })
    .select(
      "_id userId skills preferredCountries preferredRoles preferredSalary preferredJobType " +
        "experience education languages summary profileCompleteness cvFileUrl cv " +
        "nationality currentLocation preferredLocations linkedin socialLinks " +
        "totalExperienceYears workStatus"
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

  const [appCount, interviewCount, viewCount, appliedApps, pendingOfferCount, unreadMessageCount] = await Promise.all(countPromises);

  // No job cards here: the client loads them from /api/jobs/recommended (same
  // engine, same pool) after the page paints, so the page never waits on the
  // 200-job pool query and its scoring.
  const initialData: InitialHomeData = {
    profile: JSON.parse(JSON.stringify(seeker)),
    stats: {
      applicationsSent: { count: appCount as number },
      upcomingInterviews: { count: interviewCount as number },
      recruiterViews: { total: viewCount as number },
      pendingOffers: { count: Math.max(0, Number(pendingOfferCount) || 0) },
      unreadMessages: { count: Math.max(0, Number(unreadMessageCount) || 0) },
    },
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

