import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { isStoredFileUrl } from "@/lib/storage/spaces";
import { claimSeekerFiles } from "@/lib/cv/fileClaims";
import { verifyApplicationReadAccess } from "@/lib/applications/staffScope";
import { z } from "zod";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

const MAX_DOCUMENTS = 10;

const documentSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  url: z.string().url().max(2000),
  type: z.enum(["resume", "cover_letter", "portfolio", "certification", "reference", "id_document", "other"]),
});

/**
 * GET /api/applications/[id]/documents — List documents attached to an application
 */
async function getHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = params?.id;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await connectDB();

  const application = await Application.findById(id).select("documents jobSeekerId jobId").lean();
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Same readers as the application itself.
  const forbidden = await verifyApplicationReadAccess(application, ctx);
  if (forbidden) return forbidden;

  return NextResponse.json({ documents: application.documents ?? [] });
}

/**
 * POST /api/applications/[id]/documents — Add a document to an application (job_seeker only)
 */
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = params?.id;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can upload documents to applications" }, { status: 403 });
  }

  await connectDB();

  const application = await Application.findById(id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Verify ownership
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id documents.url cv.originalUrl").lean();
  if (!seeker || String(application.jobSeekerId) !== String(seeker._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot add documents to terminal statuses
  if (["rejected", "withdrawn", "hired"].includes(application.status)) {
    return NextResponse.json(
      { error: "Cannot add documents to a closed application" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsed = documentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid document data", details: parsed.error.flatten() }, { status: 400 });
  }

  // A link to another site is the seeker's to give. The address of a file in
  // OUR storage is different: the download routes sign or stream whatever an
  // application lists, so it must be one of this seeker's own files — not an
  // address they came by, attached here to be handed back to them.
  if (isStoredFileUrl(parsed.data.url)) {
    const own = seeker as { documents?: { url?: string }[]; cv?: { originalUrl?: string } };
    const ownUrls = new Set<string>([
      ...(own.documents ?? []).map((d) => d.url ?? ""),
      own.cv?.originalUrl ?? "",
      ...((application.documents ?? []) as { url?: string }[]).map((d) => d.url ?? ""),
    ]);
    if (!ownUrls.has(parsed.data.url)) {
      return NextResponse.json({ error: "That link is not one of your files." }, { status: 400 });
    }
    // Held while it is added (lib/cv/fileClaims.ts). A file the application
    // already lists is safe as it is.
    const alreadyListed = ((application.documents ?? []) as { url?: string }[]).some((d) => d.url === parsed.data.url);
    if (!alreadyListed && (await claimSeekerFiles(seeker._id, [parsed.data.url])).length > 0) {
      return NextResponse.json({ error: "That file is no longer in your documents." }, { status: 400 });
    }
  }

  if ((application.documents?.length ?? 0) >= MAX_DOCUMENTS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_DOCUMENTS} documents allowed per application` },
      { status: 400 }
    );
  }

  application.documents = application.documents ?? [];
  application.documents.push(parsed.data);
  await application.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "application.document_added",
    resource: "applications",
    resourceId: id!,
    meta: { documentName: parsed.data.name, documentType: parsed.data.type },
    req,
  });

  return NextResponse.json(
    { documents: application.documents, message: "Document added successfully" },
    { status: 201 }
  );
}

/**
 * DELETE /api/applications/[id]/documents — Remove a document by name+url (job_seeker only)
 */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = params?.id;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can remove documents" }, { status: 403 });
  }

  await connectDB();

  const application = await Application.findById(id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker || String(application.jobSeekerId) !== String(seeker._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { url } = await req.json();
  if (!url) {
    return NextResponse.json({ error: "Document url is required" }, { status: 400 });
  }

  application.documents = (application.documents ?? []).filter((d: { url: string }) => d.url !== url);
  await application.save();

  return NextResponse.json({ documents: application.documents, message: "Document removed" });
}

export const GET = withAuth(getHandler, {
  resource: "applications",
  action: "read",
});

export const POST = withAuth(postHandler, { resource: "applications", action: "update" });

export const DELETE = withAuth(deleteHandler, { resource: "applications", action: "update" });
