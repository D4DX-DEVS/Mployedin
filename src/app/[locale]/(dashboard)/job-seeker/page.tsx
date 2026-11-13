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
import { HIDDEN_COMPANY_NAME, displayCompanyLogo, isCompanyHidden } from "@/lib/jobs/companyDisclosure";
import { JobSeekerHomePage } from "@/components/features/job-seeker/home/JobSeekerHomePage";
import type { InitialHomeData } from "@/components/features/job-seeker/home/JobSeekerHomePage";
import { setRequestLocale } from "next-intl/server";
import { ACTIVE_APPLICATION_STATUSES } from "@/components/features/job-seeker/home/homeData";


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
        "totalExperienceYears workStatus " +
        // The home's "CV sent when you apply" card: which CV the apply rule picks.
        "documents.id documents.name documents.category documents.uploadedAt documents.builtHash documents.size " +
        "preferredCvId cvDesign"
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
    // One pass for the home's tiles: total, still in play, at interview.
    Application.aggregate<{ _id: string; count: number }>([
      { $match: { jobSeekerId: seekerId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
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
      .select("jobId status createdAt updatedAt statusHistory.changedAt")
      .populate({ path: "jobId", select: "title employerId discloseCompany location", populate: { path: "employerId", select: "companyName logo" } })
      // Latest change first: the home lists what changed, not what was sent.
      .sort({ updatedAt: -1 })
      .limit(8)
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

  const [statusCounts, interviewCount, viewCount, appliedApps, pendingOfferCount, unreadMessageCount] = await Promise.all(countPromises);

  // No job cards here: the client loads them from /api/jobs/recommended (same
  // engine, same pool) after the page paints, so the page never waits on the
  // 200-job pool query and its scoring.
  const byStatus = new Map((statusCounts as Array<{ _id: string; count: number }>).map((row) => [row._id, row.count]));
  const countOf = (statuses: readonly string[]) => statuses.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0);
  const appCount = [...byStatus.values()].reduce((sum, count) => sum + count, 0);

  // The built CV's design is only needed as a yes/no; the documents only as
  // what the CV card names (no file URLs reach the page).
  type HomeDoc = { id?: string; name?: string; category?: string; uploadedAt?: Date; builtHash?: string };
  const { cvDesign, documents: rawDocuments, ...profileFields } = seeker as unknown as Record<string, unknown> & {
    cvDesign?: unknown;
    documents?: HomeDoc[];
  };
  const documents: HomeDoc[] = rawDocuments ?? [];

  const initialData: InitialHomeData = {
    profile: {
      ...JSON.parse(JSON.stringify(profileFields)),
      hasBuiltCv: Boolean(cvDesign),
      resumes: documents
        .filter((d) => d.category === "resume" && d.id)
        .map((d) => ({
          id: String(d.id),
          name: String(d.name ?? ""),
          uploadedAt: d.uploadedAt ? new Date(d.uploadedAt).toISOString() : undefined,
          builtHash: d.builtHash || undefined,
        })),
    },
    stats: {
      applicationsSent: { count: appCount },
      activeApplications: { count: countOf(ACTIVE_APPLICATION_STATUSES) },
      // The seeker's Interview step: Selected is the employer's sorting.
      interviewing: { count: countOf(["interview_scheduled", "selected"]) },
      upcomingInterviews: { count: interviewCount as number },
      recruiterViews: { total: viewCount as number },
      pendingOffers: { count: Math.max(0, Number(pendingOfferCount) || 0) },
      unreadMessages: { count: Math.max(0, Number(unreadMessageCount) || 0) },
    },
    appliedJobs: (appliedApps as Array<Record<string, unknown>>).map((app) => {
      const job = app.jobId as Record<string, unknown> | null;
      const emp = job?.employerId as { companyName?: string; logo?: string } | null;
      const disclosure = job as { discloseCompany?: boolean } | null;
      const appliedDate = app.createdAt instanceof Date ? app.createdAt : new Date(String(app.createdAt ?? ""));
      const history = (app.statusHistory as Array<{ changedAt?: Date }> | undefined) ?? [];
      const lastChange = history.at(-1)?.changedAt;
      const changedDate = lastChange ? new Date(lastChange) : appliedDate;
      const location = job?.location as { city?: string; country?: string } | undefined;
      return {
        _id: String(job?._id ?? ""),
        title: String(job?.title ?? ""),
        companyName: isCompanyHidden(disclosure) ? HIDDEN_COMPANY_NAME : (emp?.companyName ?? undefined),
        companyLogo: displayCompanyLogo(disclosure, emp?.logo),
        status: String(app.status ?? "applied"),
        appliedAt: isNaN(appliedDate.getTime()) ? undefined : appliedDate.toISOString(),
        changedAt: isNaN(changedDate.getTime()) ? undefined : changedDate.toISOString(),
        place: [location?.city, location?.country].filter(Boolean).join(", ") || undefined,
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

