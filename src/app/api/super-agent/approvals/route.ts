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

  // Find the super agent's managed agents to scope jobs
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  const agentDocIds = saProfile?.agentIds ?? [];
  const agentDocs = agentDocIds.length > 0
    ? await Agent.find({ _id: { $in: agentDocIds } }).select("assignedEmployerIds").lean()
    : [];
  const employerIds = agentDocs.flatMap((a) => a.assignedEmployerIds ?? []);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // job status (active, draft, closed, expired) — optional
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const skip = (page - 1) * limit;
  const search = searchParams.get("search")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  // Optional job status filter
  if (status && ["active", "draft", "closed", "expired", "pending_approval"].includes(status)) {
    query.status = status;
  }

  // Text search on title
  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  // Date range filter
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      query.createdAt.$lte = to;
    }
  }

  // Scope to agents managed by this super agent (via agentId on jobs)
  if (agentDocIds.length > 0) {
    query.$or = [
      { agentId: { $in: agentDocIds } },
      ...(employerIds.length > 0 ? [{ employerId: { $in: employerIds } }] : []),
    ];
  } else if (employerIds.length > 0) {
    query.employerId = { $in: employerIds };
  }

  // Build a scope filter (without status filter) for cross-status counts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeFilter: Record<string, any> = { ...query };
  delete scopeFilter.status;

  const [jobs, total, activeCount, draftCount, closedCount, expiredCount, employerAgg] = await Promise.all([
    Job.find(query)
      .populate("employerId", "companyName name")
      .populate("agentId", "userId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("title status location category createdAt employerId agentId")
      .lean(),
    Job.countDocuments(query),
    Job.countDocuments({ ...scopeFilter, status: "active" }),
    Job.countDocuments({ ...scopeFilter, status: "draft" }),
    Job.countDocuments({ ...scopeFilter, status: "closed" }),
    Job.countDocuments({ ...scopeFilter, status: "expired" }),
    Job.distinct("employerId", scopeFilter),
  ]);

  const totalAll = activeCount + draftCount + closedCount + expiredCount;

  return NextResponse.json({
    jobs,
    counts: {
      total: totalAll,
      active: activeCount,
      draft: draftCount,
      closed: closedCount,
      expired: expiredCount,
      employers: employerAgg.length,
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export const GET = withAuth(handler, { resource: "jobs", action: "read" });
