import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import SuperAgent from "@/models/SuperAgent";

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

  const count = await Job.countDocuments({
    "poster.approvalStatus": "pending",
    agentId: { $in: agentDocIds },
  });

  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}

export const GET = withAuth(handler, { resource: "jobs", action: "read" });
