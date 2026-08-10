import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import SavedJob from "@/models/SavedJob";
import ProfileView from "@/models/ProfileView";
import Job from "@/models/Job";
import { calculateMatchScore, jobProfileFromDoc } from "@/lib/matchScore";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import { JobSeekerHomePage } from "@/components/features/job-seeker/home/JobSeekerHomePage";
import type { InitialHomeData } from "@/components/features/job-seeker/home/JobSeekerHomePage";
import { setRequestLocale } from "next-intl/server";

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
        "nationality currentLocation linkedin socialLinks"
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

  // Fetch applied job IDs and snippets in parallel with other counts
  const [appCount, interviewCount, savedCount, viewCount, recentJobs, appliedApps, allActiveApps] = await Promise.all([
    Application.countDocuments({ jobSeekerId: seekerId }),
    Interview.countDocuments({
      jobSeekerId: seekerId,
      scheduledAt: { $gte: now },
      status: { $nin: ["cancelled"] },
    }),
    SavedJob.countDocuments({ jobSeekerId: seekerId }),
    // ProfileView.jobSeekerId holds the User id (that is what
    // GET /api/job-seekers/[id] writes), not the JobSeeker profile _id — the
    // sibling counters correctly use seekerId, this one must not.
    ProfileView.countDocuments({
      jobSeekerId: seeker.userId,
      viewedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }),
    Job.find({
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("title salary location employerId tags createdAt requirements")
      .populate("employerId", "companyName logo")
      .lean(),
    Application.find({ jobSeekerId: seekerId })
      .select("jobId status")
      .populate({ path: "jobId", select: "title employerId", populate: { path: "employerId", select: "companyName logo" } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    // ALL non-withdrawn applications — the exclusion set must cover every
    // applied job (the 5-item list above is for display only), and withdrawn
    // jobs must stay recommendable (parity with /api/jobs/recommended).
    Application.find({ jobSeekerId: seekerId, status: { $ne: "withdrawn" } })
      .select("jobId")
      .lean(),
  ]);

  // Build a Set of applied job IDs for fast exclusion
  const appliedJobIdSet = new Set(
    (allActiveApps as Array<{ jobId?: unknown }>).map((a) => String(a.jobId))
  );

  // Score and rank recommended jobs server-side, excluding already-applied ones
  // Fully serialize to plain primitives — populated subdocs still carry Mongoose ObjectIds
  const seekerProfile = await effectiveSeekerProfile(userId, seeker);

  // Relevance signal: drop jobs completely unrelated to the seeker — no skill
  // overlap AND no role-title match (e.g. "Sales support staff" for a MERN/UI-UX
  // profile). Only applied when the seeker has both skills and preferred roles.
  const seekerSkillSet = new Set(seekerProfile.skills.map((s) => s.toLowerCase()));
  const seekerRoleList = (seekerProfile.preferredRoles ?? []).map((r) => r.toLowerCase());
  const hasRelevanceSignal = seekerSkillSet.size > 0 && seekerRoleList.length > 0;
  const isRelevantJob = (job: Record<string, unknown>): boolean => {
    if (!hasRelevanceSignal) return true;
    const reqs = job.requirements as { skills?: string[] } | null;
    const jobSkills = (reqs?.skills ?? []).map((s) => s.toLowerCase());
    const skillOverlap = jobSkills.some((s) => seekerSkillSet.has(s));
    const titleLower = String(job.title ?? "").toLowerCase();
    const roleMatch = seekerRoleList.some(
      (role) => titleLower.includes(role) || role.includes(titleLower),
    );
    return skillOverlap || roleMatch;
  };

  const scoredJobs = (recentJobs as Array<Record<string, unknown>>)
    .filter((job) => !appliedJobIdSet.has(String(job._id)))
    .filter(isRelevantJob)
    .map((job) => {
      const emp = job.employerId as { companyName?: string; logo?: string } | null;
      const loc = job.location as { city?: string; country?: string; isRemote?: boolean } | null;
      const sal = job.salary as { min?: number; max?: number; currency?: string } | null;
      const rawDate = job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt as string ?? 0);
      return {
        _id: String(job._id),
        title: String(job.title ?? ""),
        createdAt: isNaN(rawDate.getTime()) ? new Date(0).toISOString() : rawDate.toISOString(),
        matchScore: calculateMatchScore(seekerProfile, jobProfileFromDoc(job as Parameters<typeof jobProfileFromDoc>[0])),
        // Serialize nested objects to plain primitives only
        location: loc
          ? { city: loc.city ?? undefined, country: loc.country ?? undefined, isRemote: loc.isRemote ?? false }
          : undefined,
        salary: sal
          ? { min: sal.min ?? undefined, max: sal.max ?? undefined, currency: sal.currency ?? undefined }
          : undefined,
        employerId: emp
          ? { companyName: emp.companyName ?? undefined, logo: emp.logo ?? undefined }
          : undefined,
      };
    })
    .filter((j) => j.matchScore >= 30)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);

  const initialData: InitialHomeData = {
    profile: JSON.parse(JSON.stringify(seeker)),
    stats: {
      applicationsSent: { count: appCount },
      upcomingInterviews: { count: interviewCount },
      savedJobs: { count: savedCount },
      recruiterViews: { total: viewCount },
    },
    jobs: scoredJobs,
    appliedJobs: (appliedApps as Array<Record<string, unknown>>).map((app) => {
      const job = app.jobId as Record<string, unknown> | null;
      const emp = job?.employerId as { companyName?: string; logo?: string } | null;
      return {
        _id: String(job?._id ?? ""),
        title: String(job?.title ?? ""),
        companyName: emp?.companyName ?? undefined,
        companyLogo: emp?.logo ?? undefined,
        status: String(app.status ?? "applied"),
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
      initialData={initialData}
      userName={sessionUser.name ?? undefined}
      userImage={sessionUser.image ?? undefined}
    />
  );
}

