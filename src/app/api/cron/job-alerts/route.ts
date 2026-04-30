import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { notify } from "@/lib/notifications/trigger";

/**
 * GET /api/cron/job-alerts
 * Sends job alert notifications to job seekers based on their preferences.
 * Runs daily — finds new jobs from last 24h and matches against preferences.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get jobs posted in the last 24 hours
  const newJobs = await Job.find({
    status: "active",
    deletedAt: null,
    createdAt: { $gte: since },
  })
    .select("title location requirements salary employmentType category tags employerId")
    .populate("employerId", "companyName")
    .lean();

  if (newJobs.length === 0) {
    return NextResponse.json({ message: "No new jobs to alert", sent: 0 });
  }

  // Get active job seekers with preferences
  const seekers = await JobSeeker.find({
    profileVisibility: "visible",
    availabilityStatus: { $ne: "not_available" },
  })
    .select("userId preferredRoles preferredCountries preferredLocations skills preferredJobType preferredSalary")
    .limit(5000)
    .lean();

  let sentCount = 0;
  const errors: string[] = [];

  for (const seeker of seekers) {
    try {
      // Match jobs against seeker preferences
      const matchedJobs = newJobs.filter((job) => {
        let score = 0;

        // Role match
        if (seeker.preferredRoles?.length) {
          const titleLower = job.title.toLowerCase();
          if (seeker.preferredRoles.some((role: string) => titleLower.includes(role.toLowerCase()))) {
            score += 3;
          }
        }

        // Location/country match
        if (seeker.preferredCountries?.length && job.location?.country) {
          if (seeker.preferredCountries.some((c: string) => c.toLowerCase() === job.location.country.toLowerCase())) {
            score += 2;
          }
        }

        // Skills match
        if (seeker.skills?.length && job.requirements?.skills?.length) {
          const seekerSkills = seeker.skills.map((s: string) => s.toLowerCase());
          const matchCount = job.requirements.skills.filter((s: string) => seekerSkills.includes(s.toLowerCase())).length;
          if (matchCount > 0) score += Math.min(matchCount, 3);
        }

        // Remote preference
        if (seeker.preferredJobType === "remote" && job.location?.isRemote) {
          score += 1;
        }

        return score >= 2; // minimum threshold
      });

      if (matchedJobs.length === 0) continue;

      const topJobs = matchedJobs.slice(0, 5);
      const jobTitles = topJobs.map((j) => j.title).join(", ");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyNames = [...new Set(topJobs.map((j) => (j.employerId as any)?.companyName).filter(Boolean))].slice(0, 3).join(", ");

      await notify({
        userId: String(seeker.userId),
        type: "new_job_posted",
        title: `${matchedJobs.length} new job${matchedJobs.length > 1 ? "s" : ""} matching your profile`,
        message: `New openings: ${jobTitles.slice(0, 100)}${jobTitles.length > 100 ? "..." : ""} at ${companyNames}`,
        link: "/job-seeker/jobs",
        sendEmail: true,
      });

      sentCount++;
    } catch (err) {
      errors.push(`Seeker ${seeker._id}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    message: `Job alerts sent`,
    newJobsCount: newJobs.length,
    seekersChecked: seekers.length,
    alertsSent: sentCount,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
