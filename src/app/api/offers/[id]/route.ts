import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Offer from "@/models/Offer";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
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

/**
 * Returns true if the agent/super_agent is assigned to the offer's employer.
 * Used to scope agent access so they can only read/act on offers within their
 * assigned employer portfolio.
 */
async function agentOwnsOffer(userId: string, employerId: unknown): Promise<boolean> {
  const agentDoc = await Agent.findOne({ userId }).select("assignedEmployerIds").lean();
  const assigned = (agentDoc?.assignedEmployerIds ?? []).map((id: unknown) => String(id));
  return assigned.includes(String(employerId));
}

/**
 * Returns true if the super-agent oversees the offer's employer — i.e. the
 * employer's assigned agent is within the super-agent's effective scope (team +
 * region). Super-agents have no Agent document, so agentOwnsOffer always denied
 * them; this restores legitimate portfolio access while still scoping by region.
 */
async function superAgentOwnsOffer(userId: string, employerId: unknown): Promise<boolean> {
  const scope = await getSuperAgentScope(userId);
  if (!scope || scope.effectiveAgentIds.length === 0) return false;
  const emp = await Employer.findById(employerId).select("agentId").lean();
  if (!emp?.agentId) return false;
  return scope.effectiveAgentIds.map(String).includes(String(emp.agentId));
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
  } else if (ctx.role === "agent") {
    if (!(await agentOwnsOffer(ctx.userId, offer.employerId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "super_agent") {
    if (!(await superAgentOwnsOffer(ctx.userId, offer.employerId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Record the first time the candidate opens the offer.
  if (ctx.role === "job_seeker" && !offer.viewedAt && offer.status === "pending") {
    await Offer.updateOne(
      { _id: offer._id, viewedAt: { $exists: false } },
      {
        $set: { viewedAt: new Date() },
        $push: { events: { type: "viewed", at: new Date(), actorRole: "job_seeker" } },
      }
    ).catch(() => {
      /* non-blocking */
    });
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
  const { status, declineReason, signatureName, counterOffer } = body;

  const prevStatus = offer.status;
  offer.status = status;
  offer.respondedAt = new Date();
  if (declineReason) offer.declineReason = declineReason;
  // Capture the candidate's e-signature on acceptance (FG-6).
  if (status === "accepted" && signatureName) {
    offer.signature = {
      fullName: signatureName,
      signedAt: new Date(),
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined,
    };
  }
  // Store the candidate's counter-proposal.
  if (status === "countered" && counterOffer) {
    offer.counterOffer = { ...counterOffer, proposedAt: new Date() };
  }

  const seekerName = await User.findById(ctx.userId).select("name").lean();
  offer.events = offer.events ?? [];
  offer.events.push({
    type: status,
    at: new Date(),
    actorRole: "job_seeker",
    actorName: (seekerName as { name?: string } | null)?.name ?? "Candidate",
    note: status === "declined" ? declineReason : counterOffer?.note,
  });

  await offer.save();

  // Update application status based on offer response
  const application = await Application.findById(offer.applicationId);
  if (application) {
    if (status === "accepted") {
      application.status = "hired";
    } else if (status === "declined") {
      application.status = "selected"; // Back to selected if declined
    }
    // "countered" keeps the application in the "offer" stage.
    await application.save();
  }

  // Notify employer
  const employer = await Employer.findById(offer.employerId).select("userId").lean();
  if (employer) {
    let title: string;
    let message: string;
    if (status === "countered" && counterOffer) {
      const counterText = `${counterOffer.currency} ${Number(counterOffer.amount).toLocaleString()} / ${counterOffer.period}`;
      title = "Counter-Offer Received";
      message = `The candidate submitted a counter-offer: ${counterText}.${counterOffer.note ? `\n\nNote: ${counterOffer.note}` : ""}\n\nReview and revise or decline.`;
    } else {
      const statusLabel = status === "accepted" ? "accepted" : "declined";
      title = `Offer ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`;
      message = `Your offer has been ${statusLabel}. Check the details for more information.`;
    }
    await notify({
      userId: String(employer.userId),
      type: "offer_update",
      title,
      message,
      link: `/${ctx.locale}/employer/applications`,
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

// DELETE /api/offers/[id] — employer or assigned agent withdraws offer
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const offer = await Offer.findById(params?.id);
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Only an employer or an assigned agent can withdraw, and only while pending.
  if (!["employer", "agent", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Not allowed to withdraw offers" }, { status: 403 });
  }

  if (offer.status !== "pending") {
    return NextResponse.json(
      { error: "Can only withdraw pending offers" },
      { status: 400 }
    );
  }

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(offer.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "super_agent") {
    if (!(await superAgentOwnsOffer(ctx.userId, offer.employerId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!(await agentOwnsOffer(ctx.userId, offer.employerId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  offer.status = "withdrawn";
  offer.events = offer.events ?? [];
  offer.events.push({ type: "withdrawn", at: new Date(), actorRole: ctx.role });
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
