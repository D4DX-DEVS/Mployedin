import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Offer from "@/models/Offer";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (ctx.role === "job_seeker") {
    // Job seeker views received offers
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return NextResponse.json({ offers: [], pagination: { page, limit, total: 0, pages: 0 } });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    // Employer views sent offers
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ offers: [], pagination: { page, limit, total: 0, pages: 0 } });
    query.employerId = emp._id;
  }

  if (status) query.status = status;

  const jobId = searchParams.get("jobId") ?? "";
  if (jobId) query.jobId = jobId;

  const skip = (page - 1) * limit;
  const [offers, total] = await Promise.all([
    Offer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("jobId", "title location")
      .populate("applicationId", "status")
      .populate("jobSeekerId", "name")
      .lean(),
    Offer.countDocuments(query),
  ]);

  return NextResponse.json({
    offers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
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
