import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import ContactSubmission from "@/models/ContactSubmission";
import type { UserRole } from "@/models/User";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sendEmail } from "@/lib/communications/email";
import logger from "@/lib/logger";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const item = await ContactSubmission.findById(params?.id).lean();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const item = await ContactSubmission.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A body means "reply and close"; no body keeps the original mark-as-read.
  const body = await req.json().catch(() => ({}));
  const reply = typeof body?.reply === "string" ? body.reply.trim() : "";

  item.isRead = true;
  item.readAt = new Date();
  item.readBy = ctx.userId as unknown as typeof item.readBy;

  if (reply) {
    if (reply.length > 5000) {
      return NextResponse.json({ error: "Reply is too long." }, { status: 400 });
    }
    try {
      await sendEmail({
        to: item.email,
        subject: item.subject ? `Re: ${item.subject}` : "Re: your enquiry",
        // The reader typed plain text; keep their line breaks.
        html: `<p>${reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "</p><p>")}</p>`,
        text: reply,
      });
    } catch (err) {
      logger.error({ err, submissionId: params?.id }, "Contact reply email failed");
      return NextResponse.json(
        { error: "We couldn't send the reply. Please try again." },
        { status: 502 },
      );
    }
    item.repliedAt = new Date();
    item.repliedBy = ctx.userId as unknown as typeof item.repliedBy;
    item.replyBody = reply;
  }

  await item.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: reply ? "contact-submission.reply" : "contact-submission.read",
    resource: "contact_submissions",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ item });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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
