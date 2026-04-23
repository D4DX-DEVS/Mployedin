import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  const employerId = searchParams.get("employerId") ?? "";
  const agentId = searchParams.get("agentId") ?? "";
  const superAgentId = searchParams.get("superAgentId") ?? "";
  const category = searchParams.get("category") ?? "";
  const workMode = searchParams.get("workMode") ?? "";
  const employmentType = searchParams.get("employmentType") ?? "";
  const location = searchParams.get("location") ?? "";
  const skills = searchParams.get("skills") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { deletedAt: null };
  if (status) query.status = status;
  if (approvalStatus) query["poster.approvalStatus"] = approvalStatus;
  if (category) query.category = { $regex: escapeRegex(category), $options: "i" };
  if (workMode) query.workMode = workMode;
  if (employmentType) query.employmentType = employmentType;
  if (location) {
    const escaped = escapeRegex(location);
    query.$or = [
      { "location.city": { $regex: escaped, $options: "i" } },
      { "location.country": { $regex: escaped, $options: "i" } },
    ];
  }
  if (skills) {
    const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (skillList.length) {
      query["requirements.skills"] = {
        $in: skillList.map((s) => new RegExp(escapeRegex(s), "i")),
      };
    }
  }

  if (employerId && Types.ObjectId.isValid(employerId)) {
    // The dropdown may send either an Employer profile _id or a User _id.
    // Resolve User _id → Employer profile _id so the filter matches Job.employerId.
    const empById = await Employer.exists({ _id: new Types.ObjectId(employerId) });
    if (empById) {
      query.employerId = new Types.ObjectId(employerId);
    } else {
      const empByUser = await Employer.findOne({ userId: new Types.ObjectId(employerId) }).select("_id").lean();
      query.employerId = empByUser ? empByUser._id : new Types.ObjectId(employerId);
    }
  }
  if (agentId && Types.ObjectId.isValid(agentId)) query.agentId = new Types.ObjectId(agentId);

  // Super-agent filter: find all agents under that super-agent, then filter jobs by those agents
  if (superAgentId && Types.ObjectId.isValid(superAgentId)) {
    const sa = await SuperAgent.findById(superAgentId).select("agentIds").lean();
    if (sa?.agentIds?.length) {
      query.agentId = { $in: sa.agentIds };
    } else {
      return NextResponse.json({ jobs: [], pagination: { page, limit, total: 0, pages: 0 } });
    }
  }

  // Search: use $text when possible, fall back to regex when $or already exists
  if (search) {
    if (query.$or) {
      const escaped = escapeRegex(search);
      const searchRegex = { $regex: escaped, $options: "i" };
      query.$and = [
        { $or: query.$or },
        { $or: [{ title: searchRegex }, { description: searchRegex }, { tags: searchRegex }] },
      ];
      delete query.$or;
    } else {
      query.$text = { $search: search };
    }
  }

  const [rawJobs, total] = await Promise.all([
    Job.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("employerId", "companyName country industry")
      .populate({ path: "agentId", select: "userId superAgentId", populate: [{ path: "userId", select: "name email" }, { path: "superAgentId", select: "userId", populate: { path: "userId", select: "name" } }] })
      .lean(),
    Job.countDocuments(query),
  ]);

  // Flatten nested fields for the admin UI
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs = rawJobs.map((job: any) => ({
    ...job,
    approvalStatus: job.poster?.approvalStatus ?? "pending",
    applicantsCount: Array.isArray(job.applicantIds) ? job.applicantIds.length : 0,
  }));

  return NextResponse.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export const GET = withAuth(handler, { resource: "jobs", action: "read" });
