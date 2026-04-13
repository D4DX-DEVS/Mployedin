import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import SavedJob from "@/models/SavedJob";
import ProfileView from "@/models/ProfileView";
import Job from "@/models/Job";
import { calculateMatchScore, seekerProfileFromDoc, jobProfileFromDoc } from "@/lib/matchScore";
import { JobSeekerHomePage } from "@/components/features/job-seeker/home/JobSeekerHomePage";
import type { InitialHomeData } from "@/components/features/job-seeker/home/JobSeekerHomePage";

export default async function JobSeekerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);

  const userId = (session.user as unknown as { id: string }).id;

  await connectDB();

  // Lean query — only fields needed for the home page
  const seeker = await JobSeeker.findOne({ userId })
    .select(
      "_id skills preferredCountries preferredRoles preferredSalary preferredJobType " +
        "experience summary profileCompleteness cvFileUrl cv"
    )
    .lean();

  // If profile not yet created (fresh sign-up), skip SSR data
  if (!seeker) {
    return <JobSeekerHomePage locale={locale} />;
  }

  const seekerId = seeker._id;
  const now = new Date();

  const [appCount, interviewCount, savedCount, viewCount, recentJobs] = await Promise.all([
    Application.countDocuments({ jobSeekerId: seekerId }),
    Interview.countDocuments({
      jobSeekerId: seekerId,
      scheduledAt: { $gte: now },
      status: { $nin: ["cancelled"] },
    }),
    SavedJob.countDocuments({ jobSeekerId: seekerId }),
    ProfileView.countDocuments({
      jobSeekerId: seekerId,
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
  ]);

  // Score and rank recommended jobs server-side
  // Fully serialize to plain primitives — populated subdocs still carry Mongoose ObjectIds
  const seekerProfile = seekerProfileFromDoc(seeker);
  const scoredJobs = (recentJobs as Array<Record<string, unknown>>)
    .map((job) => {
      const emp = job.employerId as { companyName?: string; logo?: string } | null;
      const loc = job.location as { city?: string; country?: string; isRemote?: boolean } | null;
      const sal = job.salary as { min?: number; max?: number; currency?: string } | null;
      return {
        _id: String(job._id),
        title: String(job.title ?? ""),
        createdAt: (job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt as string)).toISOString(),
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
  };

  return <JobSeekerHomePage locale={locale} initialData={initialData} />;
}

