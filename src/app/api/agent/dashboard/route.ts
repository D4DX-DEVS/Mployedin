import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import Interview from "@/models/Interview";
import Commission from "@/models/Commission";
import Offer from "@/models/Offer";

/* ------------------------------------------------------------------ */
/*  GET /api/agent/dashboard — Consolidated agent dashboard data       */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const agent = await Agent.findOne({ userId: ctx.userId }).lean();
  if (!agent) {
    return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
  }

  const agentId = (agent as Record<string, unknown>)._id;

  const [
    activeJobs, totalApplications, scheduledInterviews,
    totalPlacements, totalLeads, pendingCommissions,
    totalOffers, recentApplications,
  ] = await Promise.all([
    Job.countDocuments({ agentId, status: "active" }),
    Application.countDocuments({ agentId }),
    Interview.countDocuments({ agentId, status: "scheduled" }),
    Placement.countDocuments({ agentId }),
    Lead.countDocuments({ agentId }),
    Commission.countDocuments({ agentId, status: "pending" }),
    Offer.countDocuments({ agentId }),
    Application.find({ agentId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("jobSeekerId", "fullName")
      .populate("jobId", "title")
      .lean(),
  ]);

  return NextResponse.json({
    metrics: {
      activeJobs,
      totalApplications,
      scheduledInterviews,
      totalPlacements,
      totalLeads,
      pendingCommissions,
      totalOffers,
    },
    recentApplications: recentApplications.map((a: Record<string, unknown>) => ({
      _id: String(a._id),
      candidateName: (a.jobSeekerId as Record<string, unknown>)?.fullName ?? "Unknown",
      jobTitle: (a.jobId as Record<string, unknown>)?.title ?? "",
      status: a.status,
      createdAt: a.createdAt,
    })),
  });
}

export const GET = withAuth(handler);
