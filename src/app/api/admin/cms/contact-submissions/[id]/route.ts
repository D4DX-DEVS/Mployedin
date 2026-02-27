import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import ContactSubmission from "@/models/ContactSubmission";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const item = await ContactSubmission.findById(params?.id).lean();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const item = await ContactSubmission.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mark as read
  item.isRead = true;
  item.readAt = new Date();
  item.readBy = ctx.userId as unknown as typeof item.readBy;
  await item.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "contact-submission.read",
    resource: "contact_submissions",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ item });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const item = await ContactSubmission.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await ContactSubmission.deleteOne({ _id: params?.id });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "contact-submission.delete",
    resource: "contact_submissions",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Deleted" });
}

export const GET = withAuth(getHandler, { resource: "contact_submissions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "contact_submissions", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "contact_submissions", action: "delete" });
