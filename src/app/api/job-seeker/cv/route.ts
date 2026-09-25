import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import connectDB from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { uploadFile } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateUploadedFile } from "@/lib/security/file-validation";
import { readUploadForm, uploadErrorResponse } from "@/lib/storage/uploadErrors";
import { registerCvDocument, releaseSeekerFile } from "@/lib/cv/cvDocuments";
import { limitCvUpload } from "@/lib/cv/uploadLimit";
import logger from "@/lib/logger";

// POST /api/job-seeker/cv — upload resume/CV file
async function postHandler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const formData = await readUploadForm(req);
  if (formData instanceof NextResponse) return formData;
  const file = (formData.get("cv") ?? formData.get("file")) as File | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  // Size + MIME whitelist + magic-byte check (same validation as cv-extract)
  const bytes = await file.arrayBuffer();
  const validationError = validateUploadedFile(file, "cv", bytes);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const fingerprint = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id cv");
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const limited = await limitCvUpload({ userId: ctx.userId, role: ctx.role, jobSeekerId: seeker._id, fingerprint });
  if (limited) return limited;

  const previousUrl = seeker.cv?.originalUrl;

  let result: { url: string };
  try {
    result = await uploadFile(file, { folder: "cvs", private: true });
  } catch (err: unknown) {
    return uploadErrorResponse(err);
  }

  await JobSeeker.updateOne(
    { userId: ctx.userId },
    {
      // cv.contentHash stays the auto-fill's "already extracted" marker; the
      // file's fingerprint lives on its CV record.
      $set: { "cv.originalUrl": result.url },
      // New CV → old ATS analysis and text are stale. Nothing is parsed yet:
      // the reader sets the text and parsedAt when it has read this file.
      $unset: { "cv.atsScore": "", "cv.atsReport": "", "cv.rawText": "", "cv.atsAnalyzedAt": "", "cv.parsedAt": "" },
    }
  );

  // Read it off the request path; the upload succeeds even if queueing fails
  // (the backfill reads anything left "uploaded").
  try {
    await registerCvDocument({
      jobSeekerId: seeker._id,
      userId: ctx.userId,
      fileUrl: result.url,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      fingerprint,
      source: "profile",
    });
  } catch (err) {
    logger.error({ err, userId: ctx.userId }, "[cv] failed to record uploaded CV");
  }

  // Only now that the new CV is stored and recorded is the old object disposable —
  // unless an application was sent with it: the employer keeps that CV.
  if (previousUrl && previousUrl !== result.url) {
    await releaseSeekerFile(seeker._id, previousUrl);
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.upload_cv",
    resource: "job_seekers",
    resourceId: ctx.userId,
    changes: { after: { cvUrl: result.url } },
    req,
  });

  return NextResponse.json({ url: result.url });
}

export const POST = withAuth(postHandler);
