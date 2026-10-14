import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest, { type IExhibitionAttachment } from "@/models/ExhibitionRequest";
import { deleteFile, uploadBuffer } from "@/lib/storage/spaces";
import { MAX_FILE_SIZES } from "@/lib/security/file-validation";
import { FileValidationError } from "@/lib/storage/uploadErrors";
import { MalwareDetectedError } from "@/lib/security/malware-scan";
import {
  ATTACHMENT_LIMITS,
  ATTACHMENT_VALIDATION,
  canManageAttachments,
  isAttachmentKind,
  signAttachments,
} from "@/lib/exhibitions/attachments";
import logger from "@/lib/logger";

/**
 * POST /api/exhibitions/[id]/attachments — multipart `kind` + `files`.
 * Event files from the agent while the request is open; completion photos
 * once the event runs. Files go to private storage after the shared magic-byte
 * and malware checks; the response carries every attachment with a signed URL.
 */
async function postHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (!mongoose.isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Refuse an oversized body before parsing it (formData buffers it all).
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "These files are too large to upload together. Add fewer at a time." }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  if (!form || !isAttachmentKind(kind)) {
    return NextResponse.json({ error: "Choose what the files are for." }, { status: 400 });
  }
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
  }

  await connectDB();
  const item = await ExhibitionRequest.findOne({ _id: params?.id, isDeleted: { $ne: true } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canManageAttachments(ctx.role, ctx.userId, item, kind)) {
    return NextResponse.json(
      { error: kind === "completion" ? "Photos can be added once the event is running." : "Files can be changed only while the request is open for edits." },
      { status: 403 },
    );
  }

  const existing = (item.attachments ?? []).filter((a: IExhibitionAttachment) => a.kind === kind).length;
  if (existing + files.length > ATTACHMENT_LIMITS[kind]) {
    return NextResponse.json(
      { error: `You can attach up to ${ATTACHMENT_LIMITS[kind]} ${kind === "completion" ? "photos" : "files"}. Remove some first.` },
      { status: 400 },
    );
  }

  const maxBytes = MAX_FILE_SIZES[ATTACHMENT_VALIDATION[kind]];
  const tooLarge = files.find((file) => file.size > maxBytes);
  if (tooLarge) {
    return NextResponse.json({ error: `${tooLarge.name} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.` }, { status: 400 });
  }

  const added: Omit<IExhibitionAttachment, "_id">[] = [];
  // A batch that stops part-way must not leave stored objects behind.
  const discard = () => Promise.all(added.map((a) => deleteFile(a.key).catch((err) => logger.warn({ err, key: a.key }, "orphan attachment not deleted"))));
  for (const file of files) {
    try {
      const result = await uploadBuffer(Buffer.from(await file.arrayBuffer()), {
        folder: "documents",
        fileName: file.name,
        contentType: file.type,
        private: true,
        validateAs: ATTACHMENT_VALIDATION[kind],
      });
      added.push({
        kind,
        fileName: file.name.slice(0, 255),
        key: result.key,
        contentType: result.contentType,
        size: result.size,
        uploadedBy: ctx.userId as unknown as IExhibitionAttachment["uploadedBy"],
        uploadedAt: new Date(),
      });
    } catch (err) {
      await discard();
      if (err instanceof FileValidationError || err instanceof MalwareDetectedError) {
        return NextResponse.json({ error: `${file.name}: ${err.message}` }, { status: 400 });
      }
      logger.error({ err, exhibitionId: params?.id }, "exhibition attachment upload failed");
      return NextResponse.json({ error: "We couldn't upload that file. Try again." }, { status: 502 });
    }
  }

  // Appended in one write that re-checks the limit and the stage, so two
  // uploads at once can neither overwrite each other nor pass the cap.
  const saved = await ExhibitionRequest.findOneAndUpdate(
    {
      _id: item._id,
      isDeleted: { $ne: true },
      status: item.status,
      $expr: {
        $lte: [
          { $size: { $filter: { input: { $ifNull: ["$attachments", []] }, cond: { $eq: ["$$this.kind", kind] } } } },
          ATTACHMENT_LIMITS[kind] - added.length,
        ],
      },
    },
    { $push: { attachments: { $each: added } } },
    { new: true },
  ).catch(async (err) => {
    logger.error({ err, exhibitionId: params?.id }, "exhibition attachment save failed");
    return null;
  });
  if (!saved) {
    await discard();
    return NextResponse.json({ error: "The request changed while uploading. Reload and try again." }, { status: 409 });
  }
  return NextResponse.json({ attachments: await signAttachments(saved.attachments) }, { status: 201 });
}

/** Ten files at the largest per-file cap, plus multipart overhead. */
const MAX_BODY_BYTES = 10 * Math.max(MAX_FILE_SIZES.cv, MAX_FILE_SIZES.image) + 1024 * 1024;

export const POST = withAuth(postHandler, { resource: "exhibitions", action: "update" });
