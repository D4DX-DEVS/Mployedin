import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { uploadFile, deleteFile } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import { validateUploadedFile } from "@/lib/security/file-validation";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// POST /api/employers/logo — upload company logo
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId });
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("logo") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const validationError = validateUploadedFile(file, "image", bytes);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Delete old logo if exists
  if (employer.logo) {
    try { await deleteFile(employer.logo); } catch { /* ignore */ }
  }

  let result: { url: string };
  try {
    result = await uploadFile(file, { folder: "avatars" });
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

  employer.logo = result.url;
  await Employer.updateOne({ _id: employer._id }, { $set: { logo: result.url } });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.upload_logo",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { after: { logo: result.url } },
    req,
  });

  return NextResponse.json({ url: result.url });
}

// DELETE /api/employers/logo — remove company logo
async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId });
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  if (employer.logo) {
    try { await deleteFile(employer.logo); } catch { /* ignore */ }
    await Employer.updateOne({ _id: employer._id }, { $unset: { logo: 1 } });

    await logActivity({
      ...actorFromCtx(ctx),
      action: "employer.remove_logo",
      resource: "employers",
      resourceId: String(employer._id),
      req,
    });
  }

  return NextResponse.json({ success: true });
}

// Writes Employer.logo, so it declares the matching permission — which is also what
// makes withAuth apply its read-only sub-role check (withAuth.ts:270).
export const POST = withAuth(postHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "update" });
