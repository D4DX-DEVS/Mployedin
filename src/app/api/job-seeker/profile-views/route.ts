import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ProfileView from "@/models/ProfileView";
import Employer from "@/models/Employer";
import User from "@/models/User";

/**
 * GET /api/job-seeker/profile-views — Get profile view analytics for job seeker
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalViews, last7Days, last30Days, bySource, byRole, recentViews] = await Promise.all([
    ProfileView.countDocuments({ jobSeekerId: ctx.userId }),
    ProfileView.countDocuments({ jobSeekerId: ctx.userId, viewedAt: { $gte: sevenDaysAgo } }),
    ProfileView.countDocuments({ jobSeekerId: ctx.userId, viewedAt: { $gte: thirtyDaysAgo } }),
    ProfileView.aggregate([
      { $match: { jobSeekerId: ctx.userId } },
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ProfileView.aggregate([
      { $match: { jobSeekerId: ctx.userId } },
      { $group: { _id: "$viewerRole", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ProfileView.find({ jobSeekerId: ctx.userId })
      .sort({ viewedAt: -1 })
      .limit(20)
      .lean(),
  ]);

  // Enrich recent views with viewer info
  const enrichedViews = await Promise.all(
    recentViews.map(async (view: Record<string, unknown>) => {
      let viewerName: string | undefined;
      let viewerCompany: string | undefined;

      if (view.viewerRole === "employer") {
        const emp = await Employer.findOne({ userId: view.viewerId }).select("companyName").lean();
        if (emp) viewerCompany = (emp as Record<string, unknown>).companyName as string;
      } else {
        const user = await User.findById(view.viewerId).select("name").lean();
        if (user) viewerName = (user as Record<string, unknown>).name as string;
      }

      return {
        _id: String(view._id),
        viewerRole: view.viewerRole,
        source: view.source ?? "direct",
        viewedAt: view.viewedAt,
        viewerName,
        viewerCompany,
      };
    })
  );

  return NextResponse.json({
    totalViews,
    last7Days,
    last30Days,
    bySource,
    byRole,
    recentViews: enrichedViews,
  });
});
