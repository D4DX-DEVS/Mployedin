import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { uploadFile, deleteFile } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateUploadedFile } from "@/lib/security/file-validation";
import { readUploadForm, uploadErrorResponse } from "@/lib/storage/uploadErrors";

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

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("cv");
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

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
      $set: { "cv.originalUrl": result.url, "cv.parsedAt": new Date() },
      // New CV → old ATS analysis is stale. Clear it so the next check re-parses.
      $unset: { "cv.atsScore": "", "cv.atsReport": "", "cv.rawText": "", "cv.atsAnalyzedAt": "" },
    }
  );

  // Only now that the new CV is stored and recorded is the old object disposable.
  if (previousUrl && previousUrl !== result.url) {
    try { await deleteFile(previousUrl); } catch { /* ignore */ }
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
