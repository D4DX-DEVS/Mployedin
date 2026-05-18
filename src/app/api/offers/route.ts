import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Offer from "@/models/Offer";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
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
      return NextResponse.json({ items: [], total: 0, stats: { total: 0, pending: 0, accepted: 0, declined: 0 } });
    }
    query.employerId = { $in: agentDoc.assignedEmployerIds };
  } else if (ctx.role === "job_seeker") {
    // Job seeker views received offers
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return NextResponse.json({ items: [], total: 0, stats: { total: 0, pending: 0, accepted: 0, declined: 0 } });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    // Employer views sent offers
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ items: [], total: 0, stats: { total: 0, pending: 0, accepted: 0, declined: 0 } });
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
      JobSeeker.find({ name: regex }).select("_id").lean(),
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
      return NextResponse.json({ items: [], total: 0, stats: { total: 0, pending: 0, accepted: 0, declined: 0 } });
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
      .populate("jobSeekerId", "name email")
      .populate("employerId", "companyName")
      .lean(),
    Offer.countDocuments(query),
  ]);

  // Transform to items format expected by the page
  const items = offers.map((o) => ({
    _id: String(o._id),
    candidateName: (o.jobSeekerId as unknown as { name?: string })?.name ?? "Unknown",
    candidateEmail: (o.jobSeekerId as unknown as { email?: string })?.email ?? "",
    jobTitle: (o.jobId as unknown as { title?: string })?.title ?? "Unknown",
    companyName: (o.employerId as unknown as { companyName?: string })?.companyName ?? "",
    salary: o.salary?.amount,
    currency: o.salary?.currency,
    status: o.status,
    startDate: o.startDate?.toISOString?.() ?? "",
    expiresAt: o.expiresAt?.toISOString?.() ?? "",
    createdAt: o.createdAt?.toISOString?.() ?? "",
  }));

  return NextResponse.json({
    items,
    total,
    stats: { total: totalCount, pending: pendingCount, accepted: acceptedCount, declined: declinedCount },
  });
}

// POST /api/offers — employer creates an offer
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Only employers can create offers" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, offerCreateSchema);
  const { applicationId, salary, startDate, benefits, notes, expiresAt } = body;

  // Verify application exists and employer owns it
  const application = await Application.findById(applicationId).populate("jobId", "employerId");
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp || String((application.jobId as unknown as { employerId: string }).employerId) !== String(emp._id)) {
    return NextResponse.json({ error: "Forbidden: application not owned by employer" }, { status: 403 });
  }

  // Set default expiry date if not provided (7 days from now)
  const expiryDate = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const offer = await Offer.create({
    applicationId,
    jobId: application.jobId,
    jobSeekerId: application.jobSeekerId,
    employerId: emp._id,
    salary,
    startDate,
    benefits,
    notes,
    status: "pending",
    expiresAt: expiryDate,
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
