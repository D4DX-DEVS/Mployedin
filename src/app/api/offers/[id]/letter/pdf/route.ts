/**
 * GET /api/offers/[id]/letter/pdf (FG-6)
 *
 * Generates and streams a formatted offer-letter PDF for an Offer. The employer
 * that owns the offer and the candidate it was sent to may both download it. The
 * letter reflects the candidate's e-signature once the offer has been accepted.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Offer from "@/models/Offer";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { generateOfferLetterPdf } from "@/lib/offers/generateOfferLetterPdf";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const offer = await Offer.findById(params?.id)
    .populate("jobId", "title")
    .populate("employerId", "companyName")
    .lean();
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Ownership: employer that owns the offer, or the candidate it was sent to.
  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker || String((offer as { jobSeekerId: unknown }).jobSeekerId) !== String((seeker as { _id: unknown })._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    const employerId = (offer as { employerId: { _id?: unknown } | unknown }).employerId;
    const offerEmployerId = (employerId as { _id?: unknown })?._id ?? employerId;
    if (!emp || String(offerEmployerId) !== String((emp as { _id: unknown })._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "agent" || ctx.role === "super_agent") {
    const employerId = (offer as { employerId: { _id?: unknown } | unknown }).employerId;
    const offerEmployerId = (employerId as { _id?: unknown })?._id ?? employerId;
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
    const assigned = (agentDoc?.assignedEmployerIds ?? []).map((id: unknown) => String(id));
    if (!assigned.includes(String(offerEmployerId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Resolve candidate name (JobSeeker.fullName or linked User.name).
  const seekerDoc = await JobSeeker.findById((offer as { jobSeekerId: unknown }).jobSeekerId)
    .select("fullName userId")
    .populate({ path: "userId", select: "name" })
    .lean();
  const candidateName =
    (seekerDoc as { fullName?: string } | null)?.fullName ||
    ((seekerDoc as { userId?: { name?: string } } | null)?.userId?.name) ||
    "Candidate";

  const employer = (offer as { employerId: { companyName?: string } }).employerId;
  const job = (offer as { jobId: { title?: string } }).jobId;
  const salary = (offer as { salary: { amount: number; currency: string; period: string } }).salary;

  const pdfBuffer = generateOfferLetterPdf({
    companyName: employer?.companyName ?? "The Company",
    candidateName,
    jobTitle: job?.title ?? "the role",
    salary,
    startDate: (offer as { startDate?: Date }).startDate,
    benefits: (offer as { benefits?: string }).benefits,
    notes: (offer as { notes?: string }).notes,
    expiresAt: (offer as { expiresAt?: Date }).expiresAt,
    createdAt: (offer as { createdAt?: Date }).createdAt,
    status: (offer as { status: string }).status,
    signature: (offer as { signature?: { fullName?: string; signedAt?: Date } }).signature,
  });

  void User; // ensure model registration for populate

  await logActivity({
    ...actorFromCtx(ctx),
    action: "offer.letter_download",
    resource: "offers",
    resourceId: String((offer as { _id: unknown })._id),
    req,
  }).catch(() => { /* non-blocking */ });

  const filename = `offer-letter-${String((offer as { _id: unknown })._id)}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withAuth(handler, { resource: "offers", action: "read" });
