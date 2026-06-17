import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Offer from "@/models/Offer";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { offerCreateSchema } from "@/lib/validators/offers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

const EMPTY_STATS = { total: 0, pending: 0, accepted: 0, declined: 0 };

function offersListResponse({
  offers = [],
  items = [],
  total = 0,
  page,
  limit,
  stats = EMPTY_STATS,
}: {
  offers?: unknown[];
  items?: unknown[];
  total?: number;
  page: number;
  limit: number;
  stats?: typeof EMPTY_STATS;
}) {
  return NextResponse.json({
    offers,
    items,
    total,
    stats,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// GET /api/offers — list offers
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";
  const scope = searchParams.get("scope") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (scope === "agent" || ctx.role === "agent") {
    // Agent views offers for their assigned employers
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
    if (!agentDoc || !agentDoc.assignedEmployerIds?.length) {
      return offersListResponse({ page, limit });
    }
    query.employerId = { $in: agentDoc.assignedEmployerIds };
  } else if (ctx.role === "job_seeker") {
    // Job seeker views received offers
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return offersListResponse({ page, limit });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    // Employer views sent offers
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return offersListResponse({ page, limit });
    query.employerId = emp._id;
  }

  if (status) query.status = status;

  const jobId = searchParams.get("jobId") ?? "";
  if (jobId) query.jobId = jobId;

  // Search by candidate name or job title via populated lookup
  if (search) {
    const regex = new RegExp(search, "i");
    const [matchingJobs, matchingSeekers] = await Promise.all([
      Job.find({ title: regex }).select("_id").lean(),
      JobSeeker.find({ fullName: regex }).select("_id").lean(),
    ]);
    const jobIds = matchingJobs.map((j) => j._id);
    const seekerIds = matchingSeekers.map((s) => s._id);
    if (jobIds.length || seekerIds.length) {
      query.$or = [
        ...(jobIds.length ? [{ jobId: { $in: jobIds } }] : []),
        ...(seekerIds.length ? [{ jobSeekerId: { $in: seekerIds } }] : []),
      ];
    } else {
      // No matches — return empty
      return offersListResponse({ page, limit });
    }
  }

  // Compute stats (without status filter)
  const statsQuery = { ...query };
  delete statsQuery.status;
  const [totalCount, pendingCount, acceptedCount, declinedCount] = await Promise.all([
    Offer.countDocuments(statsQuery),
    Offer.countDocuments({ ...statsQuery, status: "pending" }),
    Offer.countDocuments({ ...statsQuery, status: "accepted" }),
    Offer.countDocuments({ ...statsQuery, status: "declined" }),
  ]);

  const skip = (page - 1) * limit;
  const [offers, total] = await Promise.all([
    Offer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("jobId", "title location")
      .populate("applicationId", "status")
      .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name email" } })
      .populate("employerId", "companyName")
      .lean(),
    Offer.countDocuments(query),
  ]);

  // Resolve a candidate's display name from the populated job seeker -> user chain.
  const resolveCandidateName = (seeker: unknown): string => {
    const s = seeker as { fullName?: string; userId?: { name?: string } } | null;
    return s?.userId?.name || s?.fullName || "Unknown";
  };

  // Transform to items format expected by the page
  const items = offers.map((o) => ({
    _id: String(o._id),
    candidateName: resolveCandidateName(o.jobSeekerId),
    candidateEmail: (o.jobSeekerId as unknown as { userId?: { email?: string } })?.userId?.email ?? "",
    jobTitle: (o.jobId as unknown as { title?: string })?.title ?? "Unknown",
    jobLocation: (o.jobId as unknown as { location?: unknown })?.location ?? null,
    companyName: (o.employerId as unknown as { companyName?: string })?.companyName ?? "",
    salary: o.salary?.amount,
    currency: o.salary?.currency,
    period: o.salary?.period,
    benefits: o.benefits ?? "",
    notes: o.notes ?? "",
    status: o.status,
    startDate: o.startDate?.toISOString?.() ?? "",
    expiresAt: o.expiresAt?.toISOString?.() ?? "",
    respondedAt: (o as unknown as { respondedAt?: Date }).respondedAt?.toISOString?.() ?? "",
    declineReason: (o as unknown as { declineReason?: string }).declineReason ?? "",
    createdAt: o.createdAt?.toISOString?.() ?? "",
    revisionNumber: (o as unknown as { revisionNumber?: number }).revisionNumber ?? 1,
    viewedAt: (o as unknown as { viewedAt?: Date }).viewedAt?.toISOString?.() ?? "",
    lastRemindedAt: (o as unknown as { lastRemindedAt?: Date }).lastRemindedAt?.toISOString?.() ?? "",
    reminderCount: (o as unknown as { reminderCount?: number }).reminderCount ?? 0,
    counterOffer: (() => {
      const c = (o as unknown as { counterOffer?: { amount?: number; currency?: string; period?: string; note?: string; proposedAt?: Date } }).counterOffer;
      if (!c || c.amount == null) return null;
      return {
        amount: c.amount,
        currency: c.currency ?? "",
        period: c.period ?? "",
        note: c.note ?? "",
        proposedAt: c.proposedAt?.toISOString?.() ?? "",
      };
    })(),
    events: ((o as unknown as { events?: Array<{ type: string; at?: Date; actorRole?: string; actorName?: string; note?: string }> }).events ?? []).map((e) => ({
      type: e.type,
      at: e.at?.toISOString?.() ?? "",
      actorRole: e.actorRole ?? "",
      actorName: e.actorName ?? "",
      note: e.note ?? "",
    })),
  }));

  return offersListResponse({
    offers,
    items,
    total,
    page,
    limit,
    stats: { total: totalCount, pending: pendingCount, accepted: acceptedCount, declined: declinedCount },
  });
}

// POST /api/offers — employer (or an agent assigned to the employer) creates an offer
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["employer", "agent", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Not allowed to create offers" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, offerCreateSchema);
  const { applicationId, salary, startDate, benefits, notes, expiresAt } = body;

  // Verify application exists and resolve the owning employer from its job.
  const application = await Application.findById(applicationId).populate("jobId", "employerId title");
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const offerEmployerId = (application.jobId as unknown as { employerId?: unknown })?.employerId;
  if (!offerEmployerId) {
    return NextResponse.json({ error: "Application is not linked to an employer" }, { status: 400 });
  }

  // Authorize: employer owns the application directly, or an agent is assigned
  // to the owning employer's portfolio.
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(offerEmployerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden: application not owned by employer" }, { status: 403 });
    }
  } else {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
    const assigned = (agentDoc?.assignedEmployerIds ?? []).map((id: unknown) => String(id));
    if (!assigned.includes(String(offerEmployerId))) {
      return NextResponse.json({ error: "Forbidden: employer not in your assigned portfolio" }, { status: 403 });
    }
  }

  // Block duplicate active offers for the same application.
  const existing = await Offer.findOne({ applicationId, status: "pending" }).select("_id").lean();
  if (existing) {
    return NextResponse.json({ error: "An active offer already exists for this application" }, { status: 409 });
  }

  // Set default expiry date if not provided (7 days from now)
  const expiryDate = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const creator = await User.findById(ctx.userId).select("name").lean();
  const offer = await Offer.create({
    applicationId,
    jobId: application.jobId,
    jobSeekerId: application.jobSeekerId,
    employerId: offerEmployerId,
    salary,
    startDate,
    benefits,
    notes,
    status: "pending",
    expiresAt: expiryDate,
    revisionNumber: 1,
    reminderCount: 0,
    events: [
      {
        type: "created",
        at: new Date(),
        actorRole: ctx.role,
        actorName: (creator as { name?: string } | null)?.name ?? ctx.role,
      },
    ],
  });

  // Update application status to "offer"
  await Application.findByIdAndUpdate(applicationId, { status: "offer" });

  // Notify job seeker
  const jobSeeker = await JobSeeker.findById(application.jobSeekerId).select("userId").lean();
  if (jobSeeker) {
    const jobTitle = (application.jobId as unknown as { title?: string })?.title ?? "a position";
    const salaryText = `${salary.currency} ${Number(salary.amount).toLocaleString()} / ${salary.period}`;
    const startText = new Date(startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    await notify({
      userId: String(jobSeeker.userId),
      type: "application_status_update",
      title: "Job Offer Received",
      message: `You have received an offer for ${jobTitle}.\n\nSalary: ${salaryText}\nStart Date: ${startText}${benefits ? `\nBenefits: ${benefits}` : ""}\n\nPlease review and respond to this offer.`,
      link: `/en/job-seeker/offers`,
      sendEmail: true,
      metadata: { offerId: String(offer._id), applicationId, salary: salaryText, startDate: startText },
    }).catch(() => {
      /* non-blocking */
    });
  }

  // Log activity
  await logActivity({
    ...actorFromCtx(ctx),
    action: "offer.create",
    resource: "offers",
    resourceId: String(offer._id),
    meta: { applicationId, jobSeekerId: application.jobSeekerId },
    req,
  });

  // Re-fetch with populated relations to match GET response shape
  const populated = await Offer.findById(offer._id)
    .populate("jobId", "title location")
    .populate("applicationId", "status")
    .populate("jobSeekerId", "name")
    .lean();

  return NextResponse.json({ offer: populated }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const POST = withAuth(postHandler, { resource: "applications", action: "update" });
