import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { uploadFile, deleteFile } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 2MB." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
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

export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
