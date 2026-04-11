import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  // Find the super agent's managed agents to scope job approvals
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  const agentDocIds = saProfile?.agentIds ?? [];
  const agentDocs = agentDocIds.length > 0
    ? await Agent.find({ _id: { $in: agentDocIds } }).select("assignedEmployerIds").lean()
    : [];
  const employerIds = agentDocs.flatMap((a) => a.assignedEmployerIds ?? []);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {
    "poster.approvalStatus": status,
  };

  // Scope to agents managed by this super agent (via agentId on jobs)
  if (agentDocIds.length > 0) {
    query.$or = [
      { agentId: { $in: agentDocIds } },
      ...(employerIds.length > 0 ? [{ employerId: { $in: employerIds } }] : []),
    ];
  } else if (employerIds.length > 0) {
    query.employerId = { $in: employerIds };
  }

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .populate("employerId", "companyName")
      .populate("agentId", "userId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(query),
  ]);

  return NextResponse.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export const GET = withAuth(handler, { resource: "jobs", action: "read" });
