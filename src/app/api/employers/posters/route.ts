import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { uploadBuffer, deleteFile, urlToKey } from "@/lib/storage/spaces";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";

/**
 * POST /api/employers/posters
 * Upload a poster image to S3 and link it to the job.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.upload);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const jobId = formData.get("jobId") as string | null;

  if (!file || !jobId) {
    return NextResponse.json({ error: "File and jobId are required." }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
  }

  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG, and WebP are allowed." }, { status: 400 });
  }

  await connectDB();

  // Verify job belongs to this employer
  const job = await Job.findOne({
    _id: jobId,
    $or: [{ employerId: ctx.userId }, { "employerId": { $exists: true } }],
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadBuffer(buffer, {
    folder: "media",
    fileName: `poster-${jobId}-${Date.now()}.png`,
    contentType: file.type,
    validateAs: "image",
  });

  // Update job poster field
  job.poster = {
    url: result.url,
    approvalStatus: "approved",
    uploadedAt: new Date(),
  };
  await job.save();

  return NextResponse.json({
    url: result.url,
    jobId,
    savedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/employers/posters
 * List all saved posters for the employer's jobs.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();

  const jobs = await Job.find(
    {
      employerId: ctx.userId,
      "poster.url": { $exists: true, $ne: null },
    },
    { _id: 1, title: 1, poster: 1, createdAt: 1 },
  )
    .sort({ "poster.uploadedAt": -1 })
    .limit(50)
    .lean();

  const posters = jobs.map((j) => ({
    jobId: j._id,
    jobTitle: j.title,
    url: j.poster?.url,
    savedAt: j.poster?.uploadedAt,
  }));

  return NextResponse.json({ posters });
});

/**
 * DELETE /api/employers/posters
 * Remove a poster from S3 and clear the job reference.
 */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const { jobId } = await req.json();

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  await connectDB();

  const job = await Job.findOne({ _id: jobId, employerId: ctx.userId });
  if (!job || !job.poster?.url) {
    return NextResponse.json({ error: "Poster not found." }, { status: 404 });
  }

  try {
    const key = urlToKey(job.poster.url);
    await deleteFile(key);
  } catch {
    // File might already be deleted — continue
  }

  job.poster = { url: undefined, approvalStatus: "pending", uploadedAt: undefined };
  await job.save();

  return NextResponse.json({ success: true });
});
