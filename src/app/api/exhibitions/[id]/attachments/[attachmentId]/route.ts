import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest, { type IExhibitionAttachment } from "@/models/ExhibitionRequest";
import { deleteFile } from "@/lib/storage/spaces";
import { canManageAttachments, signAttachments } from "@/lib/exhibitions/attachments";
import logger from "@/lib/logger";

/** DELETE /api/exhibitions/[id]/attachments/[attachmentId] — same rules as adding one. */
async function deleteHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (!mongoose.isValidObjectId(params?.id) || !mongoose.isValidObjectId(params?.attachmentId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDB();
  const item = await ExhibitionRequest.findOne({ _id: params?.id, isDeleted: { $ne: true } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachment = (item.attachments ?? []).find((a: IExhibitionAttachment) => String(a._id) === params?.attachmentId);
  if (!attachment) return NextResponse.json({ error: "That file was already removed." }, { status: 404 });

  if (!canManageAttachments(ctx.role, ctx.userId, item, attachment.kind)) {
    return NextResponse.json({ error: "You can't remove this file at this stage." }, { status: 403 });
  }

  // One atomic $pull at the stage that was checked: a whole-array save raced
  // a concurrent upload and dropped its files.
  const saved = await ExhibitionRequest.findOneAndUpdate(
    { _id: item._id, isDeleted: { $ne: true }, status: item.status },
    { $pull: { attachments: { _id: attachment._id } } },
    { new: true },
  );
  if (!saved) return NextResponse.json({ error: "The request changed. Reload and try again." }, { status: 409 });
  // The record goes first: a stray object in storage is harmless, a record
  // pointing at a deleted object is a broken link.
  deleteFile(attachment.key).catch((err) => logger.warn({ err, key: attachment.key }, "exhibition attachment object not deleted"));

  return NextResponse.json({ attachments: await signAttachments(saved.attachments) });
}

export const DELETE = withAuth(deleteHandler, { resource: "exhibitions", action: "update" });
