import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";

interface AuthCtx {
  userId: string;
  role: string;
}

async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const saProfile = await SuperAgent.findOne({ userId: ctx.userId })
    .select("agentIds")
    .lean();
  const agentDocIds = saProfile?.agentIds ?? [];

  if (agentDocIds.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  // Match the list route scoping: include jobs from agents AND their employers
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } })
    .select("assignedEmployerIds")
    .lean();
  const employerIds = agentDocs.flatMap((a) => a.assignedEmployerIds ?? []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {
    "poster.approvalStatus": "pending",
    $or: [
      { agentId: { $in: agentDocIds } },
      ...(employerIds.length > 0 ? [{ employerId: { $in: employerIds } }] : []),
    ],
  };

  const count = await Job.countDocuments(query);

  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}

export const GET = withAuth(handler, { resource: "jobs", action: "read" });
