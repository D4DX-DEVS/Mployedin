import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
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
    // Resolve the employer and expand to all profiles sharing the same companyName
    // (handles data where the same company has multiple Employer documents).
    const emp = await Employer.findById(new Types.ObjectId(employerId)).select("companyName").lean();
    if (emp) {
      const sameNameIds = await Employer.find({ companyName: emp.companyName }).select("_id").lean();
      query.employerId = sameNameIds.length > 1
        ? { $in: sameNameIds.map(e => e._id) }
        : emp._id;
    } else {
      // Fallback: try resolving as a User _id → Employer profile _id
      const empByUser = await Employer.findOne({ userId: new Types.ObjectId(employerId) }).select("_id companyName").lean();
      if (empByUser) {
        const sameNameIds = await Employer.find({ companyName: empByUser.companyName }).select("_id").lean();
        query.employerId = sameNameIds.length > 1
          ? { $in: sameNameIds.map(e => e._id) }
          : empByUser._id;
      } else {
        query.employerId = new Types.ObjectId(employerId);
      }
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

  // Auto-scope: super_agent sees only jobs from their own agents (unless already filtered)
  if (ctx.role === "super_agent" && !query.agentId) {
    const saDoc = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
    if (saDoc?.agentIds?.length) {
      query.agentId = { $in: saDoc.agentIds };
    } else {
      return NextResponse.json({ jobs: [], pagination: { page, limit, total: 0, pages: 0 } });
    }
  }

  // Search: match jobs by title/desc/tags AND also by employer company name
  if (search) {
    const escaped = escapeRegex(search);
    const searchRegex = { $regex: escaped, $options: "i" };

    // Find employers whose company name matches the search term
    const matchingEmployers = await Employer.find(
      { companyName: { $regex: escaped, $options: "i" } },
    ).select("_id").lean();
    const matchingEmpIds = matchingEmployers.map((e) => e._id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchConditions: any[] = [
      { title: searchRegex },
      { description: searchRegex },
      { tags: searchRegex },
      { "location.city": searchRegex },
    ];
    if (matchingEmpIds.length > 0) {
      searchConditions.push({ employerId: { $in: matchingEmpIds } });
    }

    if (query.$or) {
      query.$and = [
        { $or: query.$or },
        { $or: searchConditions },
      ];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }

  const [rawJobs, total] = await Promise.all([
    Job.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("employerId", "companyName country industry")
      .populate({ path: "agentId", select: "userId superAgentId commissionRate", populate: [{ path: "userId", select: "name email" }, { path: "superAgentId", select: "userId overrideRate", populate: { path: "userId", select: "name" } }] })
      .lean(),
    Job.countDocuments(query),
  ]);

  // Platform-wide status + applicant counts for the stat tiles, independent of the
  // current status tab and of pagination (single source of truth — fixes M-1).
  const statusCountQuery = { ...query };
  delete statusCountQuery.status;
  const statusAgg = await Job.aggregate([
    { $match: statusCountQuery },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        applicants: { $sum: { $size: { $ifNull: ["$applicantIds", []] } } },
      },
    },
  ]);
  const statusCounts: Record<string, number> = {};
  let totalApplicants = 0;
  for (const s of statusAgg) {
    if (s._id) statusCounts[s._id] = s.count;
    totalApplicants += s.applicants ?? 0;
  }

  // Platform-wide poster approval-state counts, independent of the approval tab
  // and pagination (keeps the approvals overview tiles consistent — M-1).
  const approvalCountQuery = { ...query };
  delete approvalCountQuery["poster.approvalStatus"];
  const approvalAgg = await Job.aggregate([
    { $match: approvalCountQuery },
    { $group: { _id: { $ifNull: ["$poster.approvalStatus", "pending"] }, count: { $sum: 1 } } },
  ]);
  const approvalCounts: Record<string, number> = {};
  for (const a of approvalAgg) {
    if (a._id) approvalCounts[a._id] = a.count;
  }

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
    statusCounts,
    approvalCounts,
    totalApplicants,
  });
}

export { getHandler };
