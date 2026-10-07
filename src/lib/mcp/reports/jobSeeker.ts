import Application from "@/models/Application";
import Interview from "@/models/Interview";
import JobSeeker from "@/models/JobSeeker";
import ProfileView from "@/models/ProfileView";
import type { DashboardPeriod } from "@/lib/admin/dashboard/period";
import { countsByKey, windowCount, windowRanges } from "./period";

/**
 * The job seeker's own activity, using the same filters as
 * /api/dashboard/stats but over the selected period. Counts only: no job,
 * company or recruiter names. Returns null when there is no seeker profile.
 */
export async function buildJobSeekerReport(userId: string, period: DashboardPeriod) {
  const seeker = await JobSeeker.findOne({ userId }).select("_id userId").lean<{ _id: unknown; userId: unknown } | null>();
  if (!seeker) return null;

  const jobSeekerId = seeker._id;
  // ProfileView is keyed by the User id (field name `jobSeekerId`), unlike Application.
  const viewedUser = seeker.userId;
  const range = windowRanges(period);
  const [total, sent, sentBefore, byStatus, upcomingInterviews, matchAgg, views, viewsBefore] = await Promise.all([
    Application.countDocuments({ jobSeekerId }),
    Application.countDocuments({ jobSeekerId, appliedAt: range.current }),
    Application.countDocuments({ jobSeekerId, appliedAt: range.previous }),
    Application.aggregate<{ _id: unknown; count: number }>([
      { $match: { jobSeekerId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Interview.countDocuments({ jobSeekerId, status: { $nin: ["cancelled"] }, scheduledAt: { $gte: period.now } }),
    Application.aggregate<{ avg: number | null }>([
      { $match: { jobSeekerId, aiMatchScore: { $exists: true, $ne: null } } },
      // The seeker's own number per pair, never an employer's re-weighted ranking.
      { $group: { _id: null, avg: { $avg: { $ifNull: ["$seekerMatchScore", "$aiMatchScore"] } } } },
    ]),
    ProfileView.countDocuments({ jobSeekerId: viewedUser, viewedAt: range.current }),
    ProfileView.countDocuments({ jobSeekerId: viewedUser, viewedAt: range.previous }),
  ]);

  const avg = matchAgg[0]?.avg;
  return {
    scope: "Your own job search",
    applications: {
      total,
      byStatus: countsByKey(byStatus),
    },
    upcomingInterviews,
    avgMatchScore: typeof avg === "number" ? Math.round(avg) : null,
    inPeriod: {
      applicationsSent: windowCount(sent, sentBefore),
      profileViewsByRecruiters: windowCount(views, viewsBefore),
    },
  };
}
