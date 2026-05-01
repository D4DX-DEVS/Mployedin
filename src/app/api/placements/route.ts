import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Placement from "@/models/Placement";
import { validateBody } from "@/lib/validators";
import { placementCreateSchema } from "@/lib/validators/placements";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const skip = (page - 1) * limit;

  // --- Filters ---
  const visaStatus = searchParams.get("visaStatus") || searchParams.get("status");
  const commissionPaid = searchParams.get("commissionPaid");
  const search = searchParams.get("search");
  const agentId = searchParams.get("agentId");
  const employerId = searchParams.get("employerId");
  const currency = searchParams.get("currency");
  const salaryMin = searchParams.get("salaryMin");
  const salaryMax = searchParams.get("salaryMax");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const query: Record<string, unknown> = {};

  // Role-based scoping
  if (ctx.role === "employer") query.employerId = ctx.userId;
  else if (ctx.role === "agent") {
    const Agent = (await import("@/models/Agent")).default;
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    query.agentId = agentDoc._id;
  }
  else if (ctx.role === "job_seeker") query.jobSeekerId = ctx.userId;

  // Filter: visa status
  if (visaStatus && visaStatus !== "all") {
    query.visaStatus = visaStatus;
  }

  // Filter: commission paid
  if (commissionPaid === "true") query.commissionPaid = true;
  else if (commissionPaid === "false") query.commissionPaid = false;

  // Filter: agent (admin only)
  if (agentId && ctx.role === "admin") query.agentId = agentId;

  // Filter: employer (admin only)
  if (employerId && ctx.role === "admin") query.employerId = employerId;

  // Filter: currency
  if (currency && currency !== "all") query.currency = currency;

  // Filter: salary range
  if (salaryMin || salaryMax) {
    const salaryQuery: Record<string, number> = {};
    if (salaryMin) salaryQuery.$gte = Number(salaryMin);
    if (salaryMax) salaryQuery.$lte = Number(salaryMax);
    query.salary = salaryQuery;
  }

  // Filter: date range (placedAt)
  if (dateFrom || dateTo) {
    const dateQuery: Record<string, Date> = {};
    if (dateFrom) dateQuery.$gte = new Date(dateFrom);
    if (dateTo) dateQuery.$lte = new Date(dateTo);
    query.placedAt = dateQuery;
  }

  const [placements, total, aggregation, statusAgg] = await Promise.all([
    Placement.find(query)
      .populate("jobId", "title location")
      .populate("jobSeekerId", "userId")
      .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name email" } })
      .populate("employerId", "companyName")
      .populate("agentId", "userId")
      .populate({ path: "agentId", populate: { path: "userId", select: "name" } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Placement.countDocuments(query),
    // Aggregate salary totals grouped by currency
    Placement.aggregate([
      { $match: query },
      { $group: { _id: "$currency", totalSalary: { $sum: "$salary" }, count: { $sum: 1 } } },
    ]),
    // Aggregate status counts (unfiltered by status for accurate totals)
    Placement.aggregate([
      { $match: { ...query, ...(query.status ? {} : {}) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  // Build salary totals by currency
  const salaryByCurrency: Record<string, number> = {};
  let totalSalaryValue = 0;
  for (const g of aggregation) {
    const cur = g._id || "AED";
    salaryByCurrency[cur] = g.totalSalary;
    totalSalaryValue += g.totalSalary;
  }

  // Search filter: apply post-populate for candidate/company text search
  let filtered = placements;
  if (search) {
    const q = search.toLowerCase();
    filtered = placements.filter((p) => {
      const seeker = p.jobSeekerId as { userId?: { name?: string; email?: string } } | null;
      const emp = p.employerId as { companyName?: string } | null;
      const name = seeker?.userId?.name?.toLowerCase() ?? "";
      const email = seeker?.userId?.email?.toLowerCase() ?? "";
      const company = emp?.companyName?.toLowerCase() ?? "";
      return name.includes(q) || email.includes(q) || company.includes(q);
    });
  }

  // Flatten for UI consumption
  const formatted = filtered.map((p) => {
    const job = p.jobId as { title?: string; location?: string } | null;
    const seeker = p.jobSeekerId as { userId?: { name?: string; email?: string } } | null;
    const emp = p.employerId as { companyName?: string } | null;
    const agt = p.agentId as { userId?: { name?: string } } | null;
    return {
      _id: p._id,
      jobTitle: job?.title,
      candidateName: seeker?.userId?.name,
      candidateEmail: seeker?.userId?.email,
      companyName: emp?.companyName,
      agentName: agt?.userId?.name,
      startDate: p.startDate,
      placedAt: p.placedAt,
      salary: p.salary,
      currency: p.currency ?? "AED",
      visaStatus: p.visaStatus ?? "pending",
      commissionPaid: p.commissionPaid,
      commissionAmount: p.commissionAmount,
      notes: p.notes,
      createdAt: p.createdAt,
    };
  });

  return NextResponse.json({
    placements: formatted,
    total: search ? filtered.length : total,
    totalSalaryValue,
    salaryByCurrency,
    statusCounts: Object.fromEntries(statusAgg.map((s) => [s._id ?? "unknown", s.count])),
    pagination: { page, limit, total: search ? filtered.length : total, pages: Math.ceil((search ? filtered.length : total) / limit) },
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, placementCreateSchema);
  const { applicationId, jobId, jobSeekerId, employerId, startDate, salary, currency, visaStatus, notes } = body;

  const { logActivity, actorFromCtx } = await import("@/lib/audit/log");
  const placement = await Placement.create({
    applicationId,
    jobId,
    jobSeekerId,
    employerId,
    agentId: body.agentId,
    superAgentId: body.superAgentId,
    placedAt: new Date(),
    startDate: startDate ? new Date(startDate) : undefined,
    salary,
    currency: currency ?? "AED",
    visaStatus: visaStatus ?? "pending",
    commissionPaid: false,
    notes,
  });

  // Increment agent performance counter
  if (body.agentId) {
    const { incrementAgentCounter } = await import("@/lib/agentPerformance");
    incrementAgentCounter(String(body.agentId), "placementsCompleted");
  }

  // Notify super agent about new placement
  if (body.agentId) {
    const { getSuperAgentUserId, notifySuperAgentPlacement } = await import("@/lib/notifications/trigger");
    const saUserId = await getSuperAgentUserId(body.agentId);
    if (saUserId) {
      // Resolve candidate name, job title, and company name
      const [User, Job, Employer] = await Promise.all([
        import("@/models/User").then(m => m.default),
        import("@/models/Job").then(m => m.default),
        import("@/models/Employer").then(m => m.default),
      ]);
      const [jsUser, jobDoc, empDoc] = await Promise.all([
        jobSeekerId ? User.findById(jobSeekerId).select("name").lean() : null,
        jobId ? Job.findById(jobId).select("title").lean() : null,
        employerId ? Employer.findById(employerId).select("companyName").lean() : null,
      ]);
      const candidateName = (jsUser as { name?: string })?.name ?? "A candidate";
      const jobTitle = (jobDoc as { title?: string })?.title ?? "a position";
      const companyName = (empDoc as { companyName?: string })?.companyName ?? "a company";
      notifySuperAgentPlacement(saUserId, candidateName, jobTitle, companyName, String(placement._id), ctx.locale).catch(() => {});
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "placement.create",
    resource: "placements",
    resourceId: String(placement._id),
    req,
  });

  return NextResponse.json({ placement }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "placements", action: "read" });
export const POST = withAuth(postHandler, { resource: "placements", action: "create" });
