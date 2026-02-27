import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Placement from "@/models/Placement";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const visaStatus = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};

  if (ctx.role === "employer") query.employerId = ctx.userId;
  else if (ctx.role === "agent") query.agentId = ctx.userId;
  else if (ctx.role === "job_seeker") query.jobSeekerId = ctx.userId;

  if (visaStatus && visaStatus !== "all") {
    query.visaStatus = visaStatus;
  }

  const [placements, total] = await Promise.all([
    Placement.find(query)
      .populate("jobId", "title location")
      .populate("jobSeekerId", "userId")
      .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name email" } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Placement.countDocuments(query),
  ]);

  // Flatten for UI consumption
  const formatted = placements.map((p) => {
    const job = p.jobId as { title?: string; location?: string } | null;
    const seeker = p.jobSeekerId as { userId?: { name?: string; email?: string } } | null;
    return {
      _id: p._id,
      jobTitle: job?.title,
      candidateName: seeker?.userId?.name,
      candidateEmail: seeker?.userId?.email,
      startDate: p.startDate,
      salary: p.salary ? { amount: p.salary, currency: p.currency ?? "AED" } : null,
      status: p.visaStatus ?? "active",
      commissionPaid: p.commissionPaid,
      createdAt: p.createdAt,
    };
  });

  return NextResponse.json({
    placements: formatted,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await req.json();
  const { applicationId, jobId, jobSeekerId, employerId, startDate, salary, currency, visaStatus, notes } = body;

  if (!applicationId || !jobId || !jobSeekerId || !employerId) {
    return NextResponse.json({ error: "applicationId, jobId, jobSeekerId, and employerId are required" }, { status: 400 });
  }

  const { logActivity, actorFromCtx } = await import("@/lib/audit/log");
  const placement = await Placement.create({
    applicationId,
    jobId,
    jobSeekerId,
    employerId,
    agentId: body.agentId,
    superAgentId: body.superAgentId,
    placedAt: new Date(),
    startDate: startDate ? new Date(startDate) : undefined,
    salary,
    currency: currency ?? "AED",
    visaStatus: visaStatus ?? "pending",
    commissionPaid: false,
    notes,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "placement.create",
    resource: "placements",
    resourceId: String(placement._id),
    req,
  });

  return NextResponse.json({ placement }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "placements", action: "read" });
export const POST = withAuth(postHandler, { resource: "placements", action: "create" });
