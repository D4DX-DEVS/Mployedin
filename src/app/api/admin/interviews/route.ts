import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Interview from "@/models/Interview";
import Agent from "@/models/Agent";
import { escapeRegex } from "@/lib/security/sanitize";
import mongoose from "mongoose";

export const GET = withAuth(async (req: NextRequest) => {
  await connectDB();

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = parseInt(url.searchParams.get("limit") ?? "20");
  const status = url.searchParams.get("status") ?? "";
  const search = url.searchParams.get("search") ?? "";
  const employerId = url.searchParams.get("employerId") ?? "";
  const agentId = url.searchParams.get("agentId") ?? "";
  const superAgentId = url.searchParams.get("superAgentId") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const dateRange = url.searchParams.get("dateRange") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (type && ["video", "offline", "hybrid"].includes(type)) filter.type = type;

  // Date range filter
  if (dateRange && dateRange !== "all") {
    const now = new Date();
    if (dateRange === "upcoming") {
      filter.scheduledAt = { $gte: now };
    } else {
      const daysMap: Record<string, number> = { today: 0, "3days": 3, "7days": 7, "30days": 30, "90days": 90 };
      const days = daysMap[dateRange];
      if (days !== undefined) {
        if (days === 0) {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const end = new Date(start.getTime() + 86400000);
          filter.scheduledAt = { $gte: start, $lt: end };
        } else {
          const start = new Date(now.getTime() - days * 86400000);
          filter.scheduledAt = { $gte: start };
        }
      }
    }
  }

  if (employerId && mongoose.Types.ObjectId.isValid(employerId)) {
    filter.employerId = new mongoose.Types.ObjectId(employerId);
  }
  if (agentId && mongoose.Types.ObjectId.isValid(agentId)) {
    filter.agentId = new mongoose.Types.ObjectId(agentId);
  }

  // Super-agent filter: find all agents under this super-agent, then filter
  if (superAgentId && mongoose.Types.ObjectId.isValid(superAgentId)) {
    const agentIds = await Agent.find({ superAgentId: new mongoose.Types.ObjectId(superAgentId) })
      .select("_id")
      .lean();
    filter.agentId = { ...(filter.agentId ? { $eq: filter.agentId } : {}), $in: agentIds.map((a) => a._id) };
    // If agentId was also set, intersect: keep only that agent if it belongs to the super-agent
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) {
      const agentObjId = new mongoose.Types.ObjectId(agentId);
      const match = agentIds.find((a) => a._id.equals(agentObjId));
      filter.agentId = match ? agentObjId : new mongoose.Types.ObjectId(); // impossible match if not found
    }
  }

  const [interviews, totalCount] = await Promise.all([
    Interview.find(filter)
      .populate({ path: "jobSeekerId", select: "userId", populate: { path: "userId", select: "name email" } })
      .populate("employerId", "companyName")
      .populate("jobId", "title")
      .populate({ path: "agentId", select: "userId", populate: { path: "userId", select: "name" } })
      .sort({ scheduledAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Interview.countDocuments(filter),
  ]);

  // Remap populated fields to match frontend expectations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mapped = interviews.map((iv: any) => ({
    ...iv,
    jobSeeker: iv.jobSeekerId?.userId ? { name: iv.jobSeekerId.userId.name, email: iv.jobSeekerId.userId.email } : null,
    employer: iv.employerId ?? null,
    job: iv.jobId ?? null,
    agent: iv.agentId?.userId ? { _id: iv.agentId._id, name: iv.agentId.userId.name } : null,
  }));

  let total = totalCount;

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapped = mapped.filter((iv: any) =>
      rx.test(iv.jobSeeker?.name ?? "") || rx.test(iv.employer?.companyName ?? "")
    );
    total = mapped.length;
  }

  return NextResponse.json({ interviews: mapped, total });
}, { resource: "interviews", action: "read" });
