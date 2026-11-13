import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import OnboardingChecklist from "@/models/OnboardingChecklist";
import { uploadFile } from "@/lib/storage/spaces";
import { readUploadForm, uploadErrorResponse } from "@/lib/storage/uploadErrors";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import { onboardingDocState } from "@/lib/onboarding/documentState";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
];

/**
 * POST /api/job-seeker/onboarding/[id]/upload (FG-1 self-service)
 * The candidate uploads a file for a document the employer requested from them.
 * Body: multipart form-data { file, documentIndex }.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
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

  const formData = await readUploadForm(req);
  if (formData instanceof NextResponse) return formData;
  const file = formData.get("file") as File | null;
  const docIndexRaw = formData.get("documentIndex");
  const docIndex = Number(docIndexRaw);

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!Number.isInteger(docIndex) || docIndex < 0) {
    return NextResponse.json({ error: "Invalid document index" }, { status: 400 });
  }
  const doc = checklist.documents[docIndex];
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!doc.requestedFromCandidate) {
    return NextResponse.json({ error: "This document is not awaiting your upload" }, { status: 400 });
  }
  // An approved document is closed: a new file would quietly undo the approval.
  if (doc.status === "approved") {
    return NextResponse.json(
      { error: "This document is already approved. Ask your employer if it needs to change." },
      { status: 409 }
    );
  }
  if (file.size > MAX_DOC_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: PDF, JPEG, PNG, WEBP, DOCX." },
      { status: 400 }
    );
  }

  let result: { url: string };
  try {
    result = await uploadFile(file, { folder: "documents" });
  } catch (err: unknown) {
    return uploadErrorResponse(err);
  }

  doc.url = result.url;
  doc.status = "submitted";
  doc.uploadedBy = "candidate";
  doc.uploadedAt = new Date();
  // A signature was given for the file that was there; a new file needs a new
  // one. The employer's "send again" reason has now been answered.
  doc.signature = undefined;
  doc.reviewNote = undefined;
  checklist.markModified("documents");
  await checklist.save();

  // Notify the employer once the candidate's part is finished. A file that
  // still waits for its signature is not ready for them yet.
  const readyForReview = onboardingDocState(doc).stage === "in_review";
  const employer = readyForReview
    ? await Employer.findById(checklist.employerId).select("userId").lean()
    : null;
  if (employer) {
    const seekerName = (seeker as { fullName?: string }).fullName
      || (await User.findById(ctx.userId).select("name").lean() as { name?: string } | null)?.name
      || "The candidate";
    await notify({
      actorId: ctx.userId,
      userId: String((employer as { userId: unknown }).userId),
      type: "system",
      title: "Onboarding document uploaded",
      message: `${seekerName} uploaded the requested document "${doc.name}".`,
      link: `/${ctx.locale}/employer/placements/${String(checklist.placementId)}/onboarding`,
      sendEmail: true,
      metadata: { onboardingId: String(checklist._id), document: doc.name },
    }).catch(() => { /* non-blocking */ });
  }

  // Only a confirmation: the checklist also holds the employer's own tasks and
  // private notes, which are not the candidate's to read. The page refetches.
  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler, { resource: "onboarding", action: "update" });
