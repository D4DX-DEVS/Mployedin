import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Offer from "@/models/Offer";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { offerRespondSchema } from "@/lib/validators/offers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

// GET /api/offers/[id] — get single offer
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const offer = await Offer.findById(params?.id).populate("jobId", "title location").lean();
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Ownership check
  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker || String(offer.jobSeekerId) !== String(seeker._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(offer.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ offer });
}

// PATCH /api/offers/[id] — job seeker responds to offer
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const offer = await Offer.findById(params?.id);
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Only job seeker can respond
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can respond to offers" }, { status: 403 });
  }

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker || String(offer.jobSeekerId) !== String(seeker._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, offerRespondSchema);
  const { status, declineReason } = body;

  const prevStatus = offer.status;
  offer.status = status;
  offer.respondedAt = new Date();
  if (declineReason) offer.declineReason = declineReason;

  await offer.save();

  // Update application status based on offer response
  const application = await Application.findById(offer.applicationId);
  if (application) {
    if (status === "accepted") {
      application.status = "hired";
    } else if (status === "declined") {
      application.status = "selected"; // Back to selected if declined
    }
    await application.save();
  }

  // Notify employer
  const employer = await Employer.findById(offer.employerId).select("userId").lean();
  if (employer) {
    const jobTitle = offer.jobId;
    const statusLabel = status === "accepted" ? "accepted" : "declined";
    await notify({
      userId: String(employer.userId),
      type: "application_status_update",
      title: `Offer ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`,
      message: `Your offer has been ${statusLabel}. Check the details for more information.`,
      link: `/en/employer/applications`,
      sendEmail: true,
      metadata: { offerId: String(offer._id), status },
    }).catch(() => {
      /* non-blocking */
    });
  }

  // Log activity
  await logActivity({
    ...actorFromCtx(ctx),
    action: "offer.respond",
    resource: "offers",
    resourceId: params?.id,
    changes: { before: { status: prevStatus }, after: { status } },
    meta: { declineReason },
    req,
  });

  return NextResponse.json({ offer });
}

// DELETE /api/offers/[id] — employer withdraws offer
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const offer = await Offer.findById(params?.id);
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Only employer can withdraw, and only if pending
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Only employers can withdraw offers" }, { status: 403 });
  }

  if (offer.status !== "pending") {
    return NextResponse.json(
      { error: "Can only withdraw pending offers" },
      { status: 400 }
    );
  }

  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp || String(offer.employerId) !== String(emp._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  offer.status = "withdrawn";
  await offer.save();

  // Notify job seeker
  const jobSeeker = await JobSeeker.findById(offer.jobSeekerId).select("userId").lean();
  if (jobSeeker) {
    await notify({
      userId: String(jobSeeker.userId),
      type: "application_status_update",
      title: "Offer Withdrawn",
      message: "An offer you received has been withdrawn.",
      link: `/en/job-seeker/offers`,
      sendEmail: true,
      metadata: { offerId: String(offer._id) },
    }).catch(() => {
      /* non-blocking */
    });
  }

  // Log activity
  await logActivity({
    ...actorFromCtx(ctx),
    action: "offer.withdraw",
    resource: "offers",
    resourceId: params?.id,
    meta: { withdrawnBy: ctx.userId },
    req,
  });

  return NextResponse.json({ offer });
}

export const GET = withAuth(getHandler, { resource: "offers", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "offers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "offers", action: "update" });
