import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { uploadFile, deleteFile } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateUploadedFile } from "@/lib/security/file-validation";

// POST /api/job-seeker/cv — upload resume/CV file
async function postHandler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const formData = await req.formData();
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

  // Remove old CV file if it exists in storage
  if (seeker.cv?.originalUrl) {
    try { await deleteFile(seeker.cv.originalUrl); } catch { /* ignore */ }
  }

  let result: { url: string };
  try {
    result = await uploadFile(file, { folder: "cvs", private: true });
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

  await JobSeeker.updateOne(
    { userId: ctx.userId },
    { $set: { "cv.originalUrl": result.url, "cv.parsedAt": new Date() } }
  );

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
