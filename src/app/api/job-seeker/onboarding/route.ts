import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import OnboardingChecklist from "@/models/OnboardingChecklist";
import { signedOnboardingDocUrl } from "@/lib/onboarding/documentAccess";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

interface LeanSignature { fullName: string; signedAt: Date }
interface LeanDoc {
  name: string;
  url?: string;
  requestedFromCandidate?: boolean;
  requiresSignature?: boolean;
  status?: string;
  uploadedBy?: string;
  dueDate?: Date;
  signature?: LeanSignature;
  reviewNote?: string;
}
interface LeanChecklist {
  _id: unknown;
  status: string;
  startDate?: Date;
  probation?: { endDate?: Date; status?: string; notes?: string };
  documents?: LeanDoc[];
  placementId?: { startDate?: Date; jobId?: { title?: string } };
  employerId?: { companyName?: string };
}

/**
 * GET /api/job-seeker/onboarding (FG-1 self-service)
 * Returns the calling candidate's onboarding workspaces (one per placement),
 * with the documents they may upload or sign.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker) return NextResponse.json({ onboardings: [] });

  const checklists = (await OnboardingChecklist.find({ jobSeekerId: (seeker as { _id: unknown })._id })
    .populate({ path: "placementId", select: "startDate jobId", populate: { path: "jobId", select: "title" } })
    .populate({ path: "employerId", select: "companyName" })
    .sort({ updatedAt: -1 })
    .lean()) as unknown as LeanChecklist[];

  // Uploaded files are private objects: hand out signed addresses, not the
  // stored ones (those answer AccessDenied).
  const onboardings = await Promise.all(checklists.map(async (c) => ({
    _id: String(c._id),
    status: c.status,
    startDate: c.startDate ?? c.placementId?.startDate ?? null,
    probation: c.probation
      ? { endDate: c.probation.endDate ?? null, status: c.probation.status ?? null }
      : null,
    // The task list is the employer's own to-do list (set up workstation,
    // assign a buddy…). It never leaves the server for the candidate.
    documents: await Promise.all((c.documents ?? []).map(async (doc, index) => ({
      index,
      name: doc.name,
      url: await signedOnboardingDocUrl(doc.url),
      requestedFromCandidate: Boolean(doc.requestedFromCandidate),
      requiresSignature: Boolean(doc.requiresSignature),
      status: doc.status ?? null,
      uploadedBy: doc.uploadedBy ?? null,
      dueDate: doc.dueDate ?? null,
      signature: doc.signature ? { fullName: doc.signature.fullName, signedAt: doc.signature.signedAt } : null,
      reviewNote: doc.reviewNote ?? null,
    }))),
    placement: {
      jobTitle: c.placementId?.jobId?.title ?? null,
      companyName: c.employerId?.companyName ?? null,
      startDate: c.placementId?.startDate ?? null,
    },
  })));

  return NextResponse.json({ onboardings });
}

export const GET = withAuth(getHandler, { resource: "onboarding", action: "read" });
