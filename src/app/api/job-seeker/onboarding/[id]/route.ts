import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import OnboardingChecklist from "@/models/OnboardingChecklist";
import { validateBody } from "@/lib/validators";
import { onboardingSignSchema } from "@/lib/validators/onboarding";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * PATCH /api/job-seeker/onboarding/[id] (FG-1 self-service)
 * The candidate e-signs (typed-name acknowledgement) a requested document.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id fullName").lean();
  if (!seeker) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const checklist = await OnboardingChecklist.findById(params?.id);
  if (!checklist) return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
  if (String(checklist.jobSeekerId) !== String((seeker as { _id: unknown })._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, onboardingSignSchema);
  const doc = checklist.documents[body.documentIndex];
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!doc.requestedFromCandidate || !doc.requiresSignature) {
    return NextResponse.json({ error: "This document does not require your signature" }, { status: 400 });
  }

  doc.signature = {
    fullName: body.signatureName,
    signedAt: new Date(),
    ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined,
  };
  doc.status = "signed";
  doc.uploadedBy = "candidate";
  checklist.markModified("documents");
  await checklist.save();

  // Notify the employer that the candidate signed.
  const employer = await Employer.findById(checklist.employerId).select("userId").lean();
  if (employer) {
    const seekerName = (seeker as { fullName?: string }).fullName
      || (await User.findById(ctx.userId).select("name").lean() as { name?: string } | null)?.name
      || "The candidate";
    await notify({
      userId: String((employer as { userId: unknown }).userId),
      type: "system",
      title: "Onboarding document signed",
      message: `${seekerName} signed the document "${doc.name}".`,
      link: `/${ctx.locale}/employer/placements/${String(checklist.placementId)}/onboarding`,
      sendEmail: true,
      metadata: { onboardingId: String(checklist._id), document: doc.name },
    }).catch(() => { /* non-blocking */ });
  }

  return NextResponse.json({ onboarding: checklist });
}

export const PATCH = withAuth(patchHandler, { resource: "onboarding", action: "update" });
