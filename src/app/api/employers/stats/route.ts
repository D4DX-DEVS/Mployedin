import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { getEmployerPipelineCounts } from "@/lib/employers/pipelineCounts";
import { Placement } from "@/models/Placement";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/employers/stats — dashboard KPIs for current employer
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const employerId = employer._id;

  // Shared definitions (src/lib/employers/pipelineCounts.ts) so these KPIs
  // agree with the dashboard, analytics and applications workspace.
  const [pipeline, placements] = await Promise.all([
    getEmployerPipelineCounts(employerId),
    Placement.countDocuments({ employerId }),
  ]);

  return NextResponse.json({
    stats: {
      activeJobs: pipeline.activeJobs,
      totalApplications: pipeline.applications,
      scheduledInterviews: pipeline.upcomingInterviews,
      placements,
      inPipeline: pipeline.inPipeline,
      hired: pipeline.hired,
      conversionRate: pipeline.conversionRate,
      byStatus: pipeline.byStatus,
    },
  });
}

export const GET = withAuth(getHandler);
