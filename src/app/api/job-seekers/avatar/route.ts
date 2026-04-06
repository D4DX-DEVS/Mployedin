import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { uploadFile, deleteFile } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// POST /api/job-seekers/avatar — upload profile picture
async function postHandler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  await connectDB();
  const user = await User.findById(ctx.userId).select("avatar name");
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("avatar") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 2MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP." },
      { status: 400 }
    );
  }

  // Remove old avatar if it's a hosted URL
  if (user.avatar && user.avatar.startsWith("http") && !user.avatar.includes("googleusercontent") && !user.avatar.includes("linkedin")) {
    try { await deleteFile(user.avatar); } catch { /* ignore */ }
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
    return NextResponse.json({ error: "Upload failed. Please try again later." }, { status: 500 });
  }

  await User.updateOne({ _id: user._id }, { $set: { avatar: result.url } });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.upload_avatar",
    resource: "job_seekers",
    resourceId: ctx.userId,
    changes: { after: { avatar: result.url } },
    req,
  });

  return NextResponse.json({ url: result.url });
}

// DELETE /api/job-seekers/avatar — remove profile picture
async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
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
      action: "job_seeker.remove_avatar",
      resource: "job_seekers",
      resourceId: ctx.userId,
      req,
    });
  }

  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
