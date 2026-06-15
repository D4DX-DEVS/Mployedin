import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { getPresignedUrl, urlToKey } from "@/lib/storage/spaces";
import { classifyDocumentTier } from "@/lib/security/documentAccess";

/**
 * GET /api/job-seeker/documents/[docId]/download
 *
 * Returns a short-lived presigned URL (302 redirect) for a profile document.
 * Profile documents are owner-scoped: only the owning job seeker or an admin
 * may download them directly. Employers/agents access candidate documents
 * through the application-scoped route, never this one.
 */
async function getHandler(
  _req: NextRequest,
  ctx: { userId: string; role: string },
  params?: Record<string, string>
) {
  const docId = params?.docId;
  if (!docId) {
    return NextResponse.json({ error: "Document ID required" }, { status: 400 });
  }

  if (ctx.role !== "job_seeker" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const filter =
    ctx.role === "admin"
      ? { "documents.id": docId }
      : { userId: ctx.userId, "documents.id": docId };

  const seeker = await JobSeeker.findOne(filter).select("documents").lean();
  if (!seeker) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const doc = (seeker.documents as { id?: string; url?: string }[] | undefined)?.find(
    (d) => d.id === docId
  );
  if (!doc?.url) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // STRICT-tier (government ID) profile documents are still owner/admin only,
  // which this route already enforces — classification kept for parity/audit.
  classifyDocumentTier((doc as { category?: string }).category);

  let signed: string;
  try {
    signed = await getPresignedUrl(urlToKey(doc.url), 300);
  } catch {
    return NextResponse.json({ error: "Could not generate download link" }, { status: 502 });
  }

  const res = NextResponse.redirect(signed, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const GET = withAuth(getHandler);
