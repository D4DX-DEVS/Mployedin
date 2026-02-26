import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));
  const status = searchParams.get("status") ?? "";
  const approvalStatus = searchParams.get("approvalStatus") ?? "";
  const search = searchParams.get("search") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (status) query.status = status;
  if (approvalStatus) query["poster.approvalStatus"] = approvalStatus;
  if (search) query.$text = { $search: search };

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("employerId", "companyName country industry")
      .populate("agentId", "userId")
      .lean(),
    Job.countDocuments(query),
  ]);

  return NextResponse.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export const GET = withAuth(handler, { resource: "jobs", action: "read" });
