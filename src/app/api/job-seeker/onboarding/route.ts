import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import OnboardingChecklist from "@/models/OnboardingChecklist";
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
}
interface LeanTask { title: string; completed?: boolean }
interface LeanChecklist {
  _id: unknown;
  status: string;
  startDate?: Date;
  probation?: { endDate?: Date; status?: string; notes?: string };
  tasks?: LeanTask[];
  documents?: LeanDoc[];
  placementId?: { startDate?: Date; jobId?: { title?: string } };
  employerId?: { companyName?: string };
}

/**
 * GET /api/job-seeker/onboarding (FG-1 self-service)
 * Returns the calling candidate's onboarding workspaces (one per placement),
 * with read-only tasks and the documents they may upload or sign.
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

  const onboardings = checklists.map((c) => ({
    _id: String(c._id),
    status: c.status,
    startDate: c.startDate ?? c.placementId?.startDate ?? null,
    probation: c.probation
      ? { endDate: c.probation.endDate ?? null, status: c.probation.status ?? null }
      : null,
    tasks: (c.tasks ?? []).map((task) => ({ title: task.title, completed: Boolean(task.completed) })),
    documents: (c.documents ?? []).map((doc, index) => ({
      index,
      name: doc.name,
      url: doc.url ?? null,
      requestedFromCandidate: Boolean(doc.requestedFromCandidate),
      requiresSignature: Boolean(doc.requiresSignature),
      status: doc.status ?? null,
      uploadedBy: doc.uploadedBy ?? null,
      dueDate: doc.dueDate ?? null,
      signature: doc.signature ? { fullName: doc.signature.fullName, signedAt: doc.signature.signedAt } : null,
    })),
    placement: {
      jobTitle: c.placementId?.jobId?.title ?? null,
      companyName: c.employerId?.companyName ?? null,
      startDate: c.placementId?.startDate ?? null,
    },
  }));

  return NextResponse.json({ onboardings });
}

export const GET = withAuth(getHandler, { resource: "onboarding", action: "read" });
