import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { uploadFile } from "@/lib/storage/spaces";
import { readUploadForm, uploadErrorResponse } from "@/lib/storage/uploadErrors";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { createHash, randomUUID } from "crypto";
import { cvStatusesFor, registerCvDocument } from "@/lib/cv/cvDocuments";
import { removeSeekerDocuments } from "@/lib/cv/fileClaims";
import { limitCvUpload } from "@/lib/cv/uploadLimit";
import { CV_UPLOAD_MIME_TYPES } from "@/lib/applications/cvChoice";
import logger from "@/lib/logger";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
// The list the file pickers offer (cvChoice.ts), so a seeker is never offered
// a format this route refuses. uploadFile() re-checks every file against
// ALLOWED_FILE_TYPES.cv, magic bytes included.
const ALLOWED_TYPES: readonly string[] = CV_UPLOAD_MIME_TYPES;

/**
 * A stored built CV is only cleared once it is this old. Two applications
 * sent at the same moment (two tabs) each store a copy; clearing the other
 * tab's copy at once deleted a file whose application was still being
 * created, leaving that application pointing at nothing. A copy this old has
 * long since been attached — and releaseSeekerFile then keeps its file. A copy
 * an application is being saved with at that moment is kept by its claim
 * (lib/cv/fileClaims.ts).
 */
const BUILT_COPY_GRACE_MS = 10 * 60 * 1000;
const VALID_CATEGORIES = [
  "resume",
  "college_certificate",
  "course_certificate",
  "professional_certificate",
  "other",
] as const;

type DocCategory = (typeof VALID_CATEGORIES)[number];

// Marks the stored copy of the CV built on Mployedin (cv/built-cv.ts).
const BUILT_HASH_PATTERN = /^[0-9a-f]{8,64}$/;

// GET /api/job-seeker/documents — list uploaded documents
async function getHandler(_req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id documents cv.originalUrl").lean();
  if (!seeker) return NextResponse.json({ documents: [], profileCv: null });

  // Whether each resume — and the profile CV — has been read. A file with no
  // record yet predates CV reading and is waiting for the backfill.
  const docs = (seeker.documents ?? []) as Array<{ category?: string; url: string }>;
  const profileUrl = (seeker as { cv?: { originalUrl?: string } }).cv?.originalUrl ?? null;
  const urls = docs.filter((d) => d.category === "resume").map((d) => d.url);
  if (profileUrl) urls.push(profileUrl);
  const statuses = await cvStatusesFor(seeker._id, urls);
  const statusOf = (url: string) => statuses.get(url)?.status ?? "uploaded";

  return NextResponse.json({
    documents: docs.map((d) => (d.category === "resume" ? { ...d, cvStatus: statusOf(d.url) } : d)),
    profileCv: profileUrl ? { cvStatus: statusOf(profileUrl) } : null,
  });
}

// POST /api/job-seeker/documents — upload a document
async function postHandler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const formData = await readUploadForm(req);
  if (formData instanceof NextResponse) return formData;
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
      { error: "Invalid file type. Allowed: PDF, DOCX, JPG, PNG, WEBP." },
      { status: 400 }
    );
  }
  if (!VALID_CATEGORIES.includes(category as DocCategory)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  // The CV built on Mployedin, rendered to PDF by the apply dialog.
  const builtHashField = formData.get("builtHash");
  const builtHash = typeof builtHashField === "string" && builtHashField ? builtHashField : null;
  if (builtHash && (category !== "resume" || file.type !== "application/pdf" || !BUILT_HASH_PATTERN.test(builtHash))) {
    return NextResponse.json({ error: "Invalid CV" }, { status: 400 });
  }

  // Limit to 20 documents per user
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id documents");
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  // The limit is on the seeker's own files. The stored built CV is kept apart:
  // there is only ever one (a new one takes the place of the last) and the
  // apply dialog does not list it as a file, so it must not use up a slot.
  const storedBuilt: { id: string; url?: string; uploadedAt?: Date | string }[] = (seeker.documents ?? []).filter(
    (d: { builtHash?: string }) => !!d.builtHash,
  );
  const settledBefore = Date.now() - BUILT_COPY_GRACE_MS;
  const replaced = builtHash
    ? storedBuilt.filter((d) => !d.uploadedAt || new Date(d.uploadedAt).getTime() < settledBefore)
    : [];
  if (!builtHash && (seeker.documents?.length ?? 0) - storedBuilt.length >= 20) {
    return NextResponse.json({ error: "Maximum 20 documents allowed" }, { status: 400 });
  }

  // A resume is read by the AI like the profile CV, so it is limited like one.
  const fingerprint =
    category === "resume" ? createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex") : null;
  if (fingerprint) {
    const limited = await limitCvUpload({ userId: ctx.userId, role: ctx.role, jobSeekerId: seeker._id, fingerprint });
    if (limited) return limited;
  }

  let result: { url: string };
  try {
    result = await uploadFile(file, { folder: "documents", private: true });
  } catch (err: unknown) {
    return uploadErrorResponse(err);
  }

  const doc = {
    id: randomUUID(),
    name: file.name,
    category,
    url: result.url,
    size: file.size,
    uploadedAt: new Date(),
    ...(builtHash ? { builtHash } : {}),
  };

  await JobSeeker.updateOne(
    { userId: ctx.userId },
    { $push: { documents: doc } }
  );

  // The earlier built CV goes only now that the new one is stored — and its
  // file stays if an application was sent with it (the employer keeps that
  // CV) or is being saved with it right now. Tidying up must not fail the
  // upload: the new CV is stored, and a leftover copy is cleared by the next one.
  if (replaced.length > 0) {
    try {
      await removeSeekerDocuments(seeker._id, replaced.map((d) => d.id));
    } catch (err) {
      logger.warn({ err, userId: ctx.userId }, "[cv] could not clear the previous built CV");
    }
  }

  // A resume can be sent with an application, so it is read like the profile CV.
  if (fingerprint) {
    try {
      await registerCvDocument({
        jobSeekerId: seeker._id,
        userId: ctx.userId,
        fileUrl: result.url,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        fingerprint,
        source: "document",
      });
    } catch (err) {
      logger.error({ err, userId: ctx.userId }, "[cv] failed to record uploaded resume");
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.upload_document",
    resource: "job_seekers",
    resourceId: ctx.userId,
    changes: { after: { document: doc } },
    req,
  });

  return NextResponse.json({ document: category === "resume" ? { ...doc, cvStatus: "uploaded" } : doc });
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

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id documents");
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const doc = seeker.documents?.find((d: { id: string }) => d.id === id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Off the record first, then out of storage — unless an application was
  // sent with it (the employer keeps what they received) or is being saved
  // with it in another tab right now (lib/cv/fileClaims.ts).
  await removeSeekerDocuments(seeker._id, [id]);

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
