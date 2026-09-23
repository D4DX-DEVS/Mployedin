import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { uploadFile, deleteFile } from "@/lib/storage/spaces";
import { readUploadForm, uploadErrorResponse } from "@/lib/storage/uploadErrors";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateUploadedFile } from "@/lib/security/file-validation";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string }

// POST /api/agent/avatar — upload profile picture
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const user = await User.findById(ctx.userId).select("avatar name");
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const formData = await readUploadForm(req);
  if (formData instanceof NextResponse) return formData;
  const file = formData.get("avatar") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const validationError = validateUploadedFile(file, "image", bytes);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const previousAvatar = user.avatar;

  let result: { url: string };
  try {
    result = await uploadFile(file, { folder: "avatars" });
  } catch (err: unknown) {
    return uploadErrorResponse(err);
  }

  await User.updateOne({ _id: user._id }, { $set: { avatar: result.url } });

  // Remove the old avatar only once the new one is stored (never OAuth-hosted images).
  if (previousAvatar && previousAvatar.startsWith("http") && !previousAvatar.includes("googleusercontent") && !previousAvatar.includes("linkedin")) {
    try { await deleteFile(previousAvatar); } catch { /* ignore */ }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "agent.upload_avatar",
    resource: "agents",
    resourceId: ctx.userId,
    changes: { after: { avatar: result.url } },
    req,
  });

  return NextResponse.json({ url: result.url });
}

// DELETE /api/agent/avatar — remove profile picture
async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const user = await User.findById(ctx.userId).select("avatar");
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.avatar) {
    try { await deleteFile(user.avatar); } catch { /* ignore */ }
    await User.updateOne({ _id: user._id }, { $unset: { avatar: 1 } });

    await logActivity({
      ...actorFromCtx(ctx),
      action: "agent.remove_avatar",
      resource: "agents",
      resourceId: ctx.userId,
      req,
    });
  }

  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
