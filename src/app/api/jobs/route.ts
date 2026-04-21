import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { CompanyUser } from "@/models/CompanyUser";
import { notify } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { validateBody } from "@/lib/validators";
import { jobCreateSchema } from "@/lib/validators/jobs";
import { autoAssignAgent } from "@/lib/agents/autoAssign";
import { sanitizeHtml } from "@/lib/security/sanitize-html";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/jobs — paginated job search (role-scoped)
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  const rateLimit = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.api);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const approvalStatus = searchParams.get("approvalStatus") ?? "";
  const category = searchParams.get("category") ?? "";
  const location = searchParams.get("location") ?? "";
  const currency = searchParams.get("currency") ?? "";
  const workMode = searchParams.get("workMode") ?? "";
  const showSalary = searchParams.get("showSalary") ?? "";
  const skills = (searchParams.get("skills") ?? "")
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0 && skill.length <= 50)
    .slice(0, 8);
  const remote = searchParams.get("remote") === "true";
  const myJobs = searchParams.get("myJobs") === "true";
  const employerId = searchParams.get("employerId") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { deletedAt: null };

  // Agent-scoped: only their own jobs + jobs from assigned employers
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId })
      .select("_id assignedEmployerIds")
      .lean();
    if (agentDoc) {
      const conditions: Record<string, unknown>[] = [{ agentId: agentDoc._id }];
      if (agentDoc.assignedEmployerIds?.length) {
        conditions.push({ employerId: { $in: agentDoc.assignedEmployerIds } });
      }
      query.$or = conditions;
    }
  } else if (myJobs && ctx.role === "employer") {
    // Employer fetching their own jobs — scope to their employerId, no status filter
    const empDoc = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    // DEBUG: temporary logging to diagnose production vs local mismatch
    console.log("[jobs/GET] employer lookup", {
      ctxUserId: ctx.userId,
      empDocFound: !!empDoc,
      empDocId: empDoc?._id?.toString() ?? null,
    });
    if (empDoc) {
      query.employerId = empDoc._id;

      // Enforce job-level access for team members (hiring_manager / viewer)
      const teamMember = await CompanyUser.findOne({
        companyId: empDoc._id,
        userId: ctx.userId,
        status: "active",
      }).select("companyRole jobAccess").lean();

      if (
        teamMember &&
        teamMember.companyRole !== "owner" &&
        teamMember.companyRole !== "admin" &&
        teamMember.jobAccess &&
        teamMember.jobAccess.length > 0
      ) {
        query._id = { $in: teamMember.jobAccess };
      }
    }
  } else if (!myJobs) {
    query.status = "active";
    query["poster.approvalStatus"] = "approved";
    query.$or = [{ expiresAt: { $exists: false } }, { expiresAt: { $gte: new Date() } }];
  }

  const canFilterManagedJobs = myJobs || ctx.role === "agent" || ctx.role === "admin" || ctx.role === "super_agent";

  if (status && canFilterManagedJobs) query.status = status;
  if (approvalStatus && canFilterManagedJobs) query["poster.approvalStatus"] = approvalStatus;
  if (search) query.$text = { $search: search };
  if (category) query.category = category;
  if (workMode) query.workMode = workMode;
  if (location) {
    const locationPattern = new RegExp(escapeRegex(location), "i");
    const locationCondition = {
      $or: [
        { "location.country": locationPattern },
        { "location.city": locationPattern },
      ],
    };
    query.$and = [...(query.$and ?? []), locationCondition];
  }
  if (remote) query["location.isRemote"] = true;
  if (currency) query["salary.currency"] = currency;
  if (showSalary === "true" || showSalary === "false") query.showSalary = showSalary === "true";
  if (skills.length > 0) {
    query["requirements.skills"] = {
      $all: skills.map((skill) => new RegExp(`^${escapeRegex(skill)}$`, "i")),
    };
  }
  if (employerId) query.employerId = employerId;

  const skip = (page - 1) * limit;
  // DEBUG: log final query
  console.log("[jobs/GET] final query", JSON.stringify(query));
  const [jobs, total] = await Promise.all([
    Job.find(query)
      .sort(search ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("employerId", "companyName country industry logo")
      .lean(),
    Job.countDocuments(query),
  ]);
  // DEBUG: log result count
  console.log("[jobs/GET] results", { total, jobsReturned: jobs.length });

  // Aggregate real application counts from Application collection for managed job views
  if (canFilterManagedJobs && jobs.length > 0) {
    const jobIds = jobs.map((j) => j._id);
    const appCounts = await Application.aggregate([
      { $match: { jobId: { $in: jobIds } } },
      { $group: { _id: "$jobId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(appCounts.map((c) => [String(c._id), c.count as number]));
    for (const job of jobs) {
      (job as Record<string, unknown>).applicationCount = countMap.get(String(job._id)) ?? 0;
    }
  }

  return NextResponse.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit), totalPages: Math.ceil(total / limit) },
  }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

// POST /api/jobs — create a new job
async function createHandler(req: NextRequest, ctx: AuthCtx) {
  const allowed: UserRole[] = ["employer", "agent", "admin"];
  if (!allowed.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, jobCreateSchema);

  await connectDB();

  const {
    title,
    description,
    category,
    location,
    requirements,
    salary,
    employmentType,
    workMode,
    responsibilities,
    qualifications,
    benefits,
    expiresAt,
    applicationMode,
    vacancies,
    maxApplicants,
    showSalary,
    tags,
    visibility,
    status,
  } = body;

  let employerId: string | undefined;
  let agentId: string | undefined;

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id agentId").lean();
    if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    employerId = String(emp._id);

    // 8C.1: employer can assign agentId via body
    if (body.agentId) {
      const assignedAgent = await Agent.findById(body.agentId).select("assignedEmployerIds").lean();
      if (!assignedAgent || !assignedAgent.assignedEmployerIds?.map(String).includes(employerId)) {
        return NextResponse.json({ error: "This agent is not assigned to your account" }, { status: 403 });
      }
      agentId = body.agentId;
    }
    // 8C.4: auto-assign from Employer.agentId if not manually specified
    else if (emp.agentId) {
      agentId = String(emp.agentId);
    }
    // 8D.1: smart auto-assign fallback — pick best available agent for this employer
    else {
      const assigned = await autoAssignAgent({
        employerId,
        jobCity: (location as { city?: string } | undefined)?.city,
      });
      if (assigned) agentId = assigned;
    }
  } else if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    agentId = String(agent._id);
    employerId = body.employerId;
    if (employerId && !agent.assignedEmployerIds?.map(String).includes(employerId)) {
      return NextResponse.json(
        { error: "Forbidden — you are not assigned to this employer" },
        { status: 403 }
      );
    }
  } else if (ctx.role === "admin") {
    employerId = body.employerId;
    if (body.agentId) agentId = body.agentId;
  }

  // 8C.2: determine approval status based on role & agent involvement
  let approvalStatus: "pending" | "approved";
  let resolvedStatus: string;

  if (ctx.role === "admin") {
    approvalStatus = "approved";
    resolvedStatus = status ?? "active";
  } else if (ctx.role === "agent") {
    approvalStatus = "pending";
    resolvedStatus = "draft";
  } else if (ctx.role === "employer" && agentId) {
    // Employer posted with agent involvement → needs approval
    approvalStatus = "pending";
    resolvedStatus = "draft";
  } else {
    // Employer self-posting without agent → auto-approved
    approvalStatus = "approved";
    resolvedStatus = status ?? "active";
  }

  const job = await Job.create({
    title,
    description: sanitizeHtml(description),
    category,
    location: location ?? { country: "", city: "", isRemote: false },
    requirements: requirements ?? { skills: [], experienceMin: 0, experienceMax: 99 },
    salary: salary ?? { min: 0, max: 0, currency: "USD", period: "monthly" },
    employmentType,
    workMode,
    responsibilities: responsibilities ?? [],
    qualifications: qualifications ?? [],
    benefits: benefits ?? [],
    employerId,
    agentId,
    applicationMode: applicationMode ?? "manual",
    status: resolvedStatus,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    vacancies,
    maxApplicants,
    showSalary,
    tags: tags ?? [],
    visibility: visibility ?? "public",
    screeningQuestions: body.screeningQuestions ?? [],
    "poster.approvalStatus": approvalStatus,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.create",
    resource: "jobs",
    resourceId: String(job._id),
    changes: { after: { title, category, location } },
    req,
  });

  // Increment agent performance counter
  if (agentId) {
    const { incrementAgentCounter } = await import("@/lib/agentPerformance");
    incrementAgentCounter(String(agentId), "vacanciesPosted");
  }

  // 8C.3: Notify super agent when job needs approval
  if (approvalStatus === "pending" && agentId) {
    const agentDoc = await Agent.findById(agentId).select("superAgentId userId").lean();
    if (agentDoc?.superAgentId) {
      const saDoc = await SuperAgent.findById(agentDoc.superAgentId).select("userId").lean();
      if (saDoc?.userId) {
        const agentUser = await import("@/models/User").then(m =>
          m.default.findById(agentDoc.userId).select("name").lean()
        );
        const agentName = (agentUser as { name?: string })?.name ?? "An agent";

        await notify({
          userId: String(saDoc.userId),
          type: "job_posted",
          title: "New Job Pending Approval",
          message: `${agentName} submitted "${title}" for approval.`,
          link: `/${ctx.locale}/super-agent/approvals`,
          sendEmail: true,
          metadata: { jobId: String(job._id), agentId },
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({ job }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(
  withSubscription(createHandler, { type: "limit", feature: "activeJobs" }),
);
