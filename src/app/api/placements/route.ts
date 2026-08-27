import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Placement from "@/models/Placement";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { placementCreateSchema } from "@/lib/validators/placements";

// Ensure referenced schemas are registered for populate() on cold starts.
void Job; void JobSeeker; void Agent; void User;

import logger from "@/lib/logger";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifySuperAgentPlacement } from "@/lib/notifications/trigger";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const skip = (page - 1) * limit;

  // --- Filters ---
  const lifecycleStatus = searchParams.get("status");
  const visaStatus = searchParams.get("visaStatus");
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
  if (ctx.role === "employer") {
    const employerDoc = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!employerDoc) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    query.employerId = employerDoc._id;
  }
  else if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    query.agentId = agentDoc._id;
  }
  else if (ctx.role === "job_seeker") {
    const jobSeekerDoc = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!jobSeekerDoc) return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });
    query.jobSeekerId = jobSeekerDoc._id;
  }
  else if (ctx.role === "super_agent") {
    // Scope to the super-agent's team (their agents) or placements credited to
    // their profile — matching the dashboard/reports aggregation. Without this
    // the list returned every placement on the platform.
    const scope = await getSuperAgentScope(ctx.userId);
    const agentDocIds = scope?.effectiveAgentIds ?? [];
    query.$or = [
      { agentId: { $in: agentDocIds } },
      ...(scope?.saProfileId ? [{ superAgentId: scope.saProfileId }] : []),
    ];
  }

  // Filter: placement lifecycle status (active/completed/terminated).
  // Docs created before the status field existed count as "active".
  if (lifecycleStatus && lifecycleStatus !== "all") {
    query.status = lifecycleStatus === "active"
      ? { $in: ["active", null] }
      : lifecycleStatus;
  }

  // Filter: visa status (GCC) — separate from lifecycle status
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

  // Status counts must reflect all lifecycle statuses regardless of the active
  // status-tab filter, so exclude `status` from their aggregation match.
  const { status: _statusFilter, ...statusAggQuery } = query;
  void _statusFilter;

  // Same reasoning for the commission tile: with the paid/unpaid filter on it
  // would otherwise read back either `total` or 0, which is not a metric.
  const { commissionPaid: _paidFilter, ...paidAggQuery } = query;
  void _paidFilter;

  // Visa strip doubles as a filter, so selecting one visa status must not
  // collapse the other four to zero.
  const { visaStatus: _visaFilter, ...visaAggQuery } = query;
  void _visaFilter;

  // Header tiles are workspace totals, not page totals — counting the returned
  // rows only ever described the current page.
  const upcomingFrom = new Date();
  const upcomingTo = new Date(upcomingFrom.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [placements, total, aggregation, statusAgg, visaAgg, commissionPaidCount, scopeAgg] = await Promise.all([
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
    // Aggregate status counts (excludes the lifecycle-status filter for accurate totals)
    Placement.aggregate([
      { $match: statusAggQuery },
      { $group: { _id: { $ifNull: ["$status", "active"] }, count: { $sum: 1 } } },
    ]),
    Placement.aggregate([
      { $match: visaAggQuery },
      { $group: { _id: { $ifNull: ["$visaStatus", "pending"] }, count: { $sum: 1 } } },
    ]),
    Placement.countDocuments({ ...paidAggQuery, commissionPaid: true }),
    // Distinct employers + upcoming starts across the whole filtered set.
    Placement.aggregate([
      { $match: query },
      {
        $facet: {
          employers: [{ $group: { _id: "$employerId" } }, { $count: "n" }],
          upcomingStarts: [
            { $match: { startDate: { $gte: upcomingFrom, $lte: upcomingTo } } },
            { $count: "n" },
          ],
        },
      },
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
      salary: p.salary != null ? { amount: p.salary, currency: p.currency ?? "AED" } : undefined,
      currency: p.currency ?? "AED",
      status: (p as { status?: string }).status ?? "active",
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
    visaCounts: Object.fromEntries(visaAgg.map((v) => [v._id ?? "pending", v.count])),
    totals: {
      commissionPaid: commissionPaidCount,
      employers: scopeAgg[0]?.employers?.[0]?.n ?? 0,
      upcomingStarts: scopeAgg[0]?.upcomingStarts?.[0]?.n ?? 0,
    },
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
  let placement;
  try {
    placement = await Placement.create({
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
  } catch (err) {
    // Unique index on applicationId → this application is already placed.
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "A placement already exists for this application" }, { status: 409 });
    }
    throw err;
  }

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
      notifySuperAgentPlacement(saUserId, candidateName, jobTitle, companyName, String(placement._id), ctx.locale).catch((err) => logger.error({ err, placementId: String(placement._id) }, "Failed to notify super agent of new placement"));
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
