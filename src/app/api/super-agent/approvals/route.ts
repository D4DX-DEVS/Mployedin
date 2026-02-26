import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import Territory from "@/models/Territory";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  // Find the territory managed by this super-agent
  const territory = await Territory.findOne({ superAgentId: ctx.userId });
  const territoryFilter = territory ? { territory: territory._id } : {};

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const skip = (page - 1) * limit;

  const query = {
    approvalStatus: status,
    ...territoryFilter,
  };

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .populate("employerId", "name companyName")
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
