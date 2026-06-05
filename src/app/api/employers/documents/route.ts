import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { uploadFile, deleteFile } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
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
const MAX_DOCS = 10;

// POST /api/employers/documents — upload a verification document
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId });
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const currentDocs: string[] = employer.verificationDocs ?? [];
  if (currentDocs.length >= MAX_DOCS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_DOCS} documents allowed.` },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("document") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
    return NextResponse.json(
      { error: "Upload failed. Please try again later." },
      { status: 500 }
    );
  }

  await Employer.updateOne({ _id: employer._id }, { $push: { verificationDocs: result.url } });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.upload_document",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { after: { documentUrl: result.url } },
    req,
  });

  return NextResponse.json({ url: result.url });
}

// DELETE /api/employers/documents — remove a verification document
async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId });
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const docs: string[] = employer.verificationDocs ?? [];
  if (!docs.includes(url)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  try { await deleteFile(url); } catch { /* ignore storage errors */ }

  await Employer.updateOne({ _id: employer._id }, { $pull: { verificationDocs: url } });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.remove_document",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { before: { documentUrl: url } },
    req,
  });

  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
