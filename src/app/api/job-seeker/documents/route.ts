import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { uploadFile, deleteFile } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { randomUUID } from "crypto";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const VALID_CATEGORIES = [
  "resume",
  "college_certificate",
  "course_certificate",
  "professional_certificate",
  "other",
] as const;

type DocCategory = (typeof VALID_CATEGORIES)[number];

// GET /api/job-seeker/documents — list uploaded documents
async function getHandler(_req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("documents").lean();

  return NextResponse.json({ documents: seeker?.documents ?? [] });
}

// POST /api/job-seeker/documents — upload a document
async function postHandler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const category = (formData.get("category") as string) || "other";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: PDF, DOC, DOCX, JPG, PNG, WEBP." },
      { status: 400 }
    );
  }
  if (!VALID_CATEGORIES.includes(category as DocCategory)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  // Limit to 20 documents per user
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("documents");
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if ((seeker.documents?.length ?? 0) >= 20) {
    return NextResponse.json({ error: "Maximum 20 documents allowed" }, { status: 400 });
  }

  let result: { url: string };
  try {
    result = await uploadFile(file, { folder: "documents", private: true });
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

  const doc = {
    id: randomUUID(),
    name: file.name,
    category,
    url: result.url,
    size: file.size,
    uploadedAt: new Date(),
  };

  await JobSeeker.updateOne(
    { userId: ctx.userId },
    { $push: { documents: doc } }
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.upload_document",
    resource: "job_seekers",
    resourceId: ctx.userId,
    changes: { after: { document: doc } },
    req,
  });

  return NextResponse.json({ document: doc });
}

// DELETE /api/job-seeker/documents?id=xxx — remove a document
async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Document ID required" }, { status: 400 });
  }

  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("documents");
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const doc = seeker.documents?.find((d: { id: string }) => d.id === id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Delete from storage
  if (doc.url) {
    try { await deleteFile(doc.url); } catch { /* ignore */ }
  }

  await JobSeeker.updateOne(
    { userId: ctx.userId },
    { $pull: { documents: { id } } }
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.delete_document",
    resource: "job_seekers",
    resourceId: ctx.userId,
    changes: { before: { document: doc } },
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
