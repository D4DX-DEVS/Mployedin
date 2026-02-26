import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/jobs — paginated public job search
async function getHandler(req: NextRequest) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));
  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const location = searchParams.get("location") ?? "";
  const currency = searchParams.get("currency") ?? "";
  const myJobs = searchParams.get("myJobs") === "true"; // for employer view
  const employerId = searchParams.get("employerId") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (!myJobs) {
    query.status = "active";
    query.$or = [{ expiresAt: { $exists: false } }, { expiresAt: { $gte: new Date() } }];
  }

  if (search) query.$text = { $search: search };
  if (category) query.category = category;
  if (location) query.location = new RegExp(escapeRegex(location), "i");
  if (currency) query["salary.currency"] = currency;
  if (employerId) query.employerId = employerId;

  const skip = (page - 1) * limit;
  const [jobs, total] = await Promise.all([
    Job.find(query)
      .sort(search ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("employerId", "companyName country industry")
      .lean(),
    Job.countDocuments(query),
  ]);

  return NextResponse.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// POST /api/jobs — create a new job
async function createHandler(req: NextRequest, ctx: AuthCtx) {
  const allowed: UserRole[] = ["employer", "agent", "admin"];
  if (!allowed.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();

  const { title, description, category, location, requirements, salary, expiresAt, applicationMode } = body;

  if (!title || !description) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  let employerId: string | undefined;
  let agentId: string | undefined;

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    employerId = String(emp._id);
  } else if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agent) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    agentId = String(agent._id);
    employerId = body.employerId;
  } else if (ctx.role === "admin") {
    employerId = body.employerId;
  }

  const job = await Job.create({
    title,
    description,
    category,
    location,
    requirements: requirements ?? { skills: [], experienceMin: 0, experienceMax: 99 },
    salary: salary ?? { min: 0, max: 0, currency: "USD" },
    employerId,
    agentId,
    applicationMode: applicationMode ?? "manual",
    status: ctx.role === "admin" ? "active" : "draft",
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    "poster.approvalStatus": ctx.role === "admin" ? "approved" : "pending",
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.create",
    resource: "jobs",
    resourceId: String(job._id),
    changes: { after: { title, category, location } },
    req,
  });

  return NextResponse.json({ job }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(createHandler);
