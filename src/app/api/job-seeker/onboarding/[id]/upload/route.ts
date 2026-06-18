import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import OnboardingChecklist from "@/models/OnboardingChecklist";
import { uploadFile } from "@/lib/storage/spaces";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
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

  const formData = await req.formData();
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
    const code = (err as { Code?: string }).Code ?? (err as { name?: string }).name;
    if (code === "MalwareDetectedError") {
      return NextResponse.json({ error: "File rejected: failed malware scan." }, { status: 422 });
    }
    if (code === "NoSuchBucket") {
      return NextResponse.json(
        { error: "File storage is not configured. Please contact support." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Upload failed. Please try again later." }, { status: 500 });
  }

  doc.url = result.url;
  doc.status = "submitted";
  doc.uploadedBy = "candidate";
  doc.uploadedAt = new Date();
  checklist.markModified("documents");
  await checklist.save();

  // Notify the employer that the candidate uploaded the requested document.
  const employer = await Employer.findById(checklist.employerId).select("userId").lean();
  if (employer) {
    const seekerName = (seeker as { fullName?: string }).fullName
      || (await User.findById(ctx.userId).select("name").lean() as { name?: string } | null)?.name
      || "The candidate";
    await notify({
      userId: String((employer as { userId: unknown }).userId),
      type: "system",
      title: "Onboarding document uploaded",
      message: `${seekerName} uploaded the requested document "${doc.name}".`,
      link: `/${ctx.locale}/employer/placements/${String(checklist.placementId)}/onboarding`,
      sendEmail: true,
      metadata: { onboardingId: String(checklist._id), document: doc.name },
    }).catch(() => { /* non-blocking */ });
  }

  return NextResponse.json({ onboarding: checklist });
}

export const POST = withAuth(postHandler, { resource: "onboarding", action: "update" });
