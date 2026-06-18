import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import { isValidObjectId } from "@/lib/security/sanitize";
import { getPresignedUrl, urlToKey } from "@/lib/storage/spaces";
import {
  classifyDocumentTier,
  canAccessApplicationDocument,
} from "@/lib/security/documentAccess";

/**
 * GET /api/applications/[id]/documents/download?i=<index>
 * GET /api/applications/[id]/documents/download?cv=1
 *
 * Returns a short-lived presigned URL (302 redirect) for a document attached
 * to — or justified by — a specific application. Access is governed by the
 * tiered policy in lib/security/documentAccess (owner, application-scoped
 * employer/agent, admin; government IDs gated to the Offer/Hired stage).
 *
 * The object key is always re-derived server-side from the database, so a
 * leaked URL cannot be used to bypass these checks once objects are private.
 */
async function getHandler(
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>
) {
  const id = params?.id;
  if (!id || !isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid application ID" }, { status: 400 });
  }

  await connectDB();

  const app = await Application.findById(id)
    .select("jobSeekerId employerId agentId status documents")
    .lean();
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const seeker = await JobSeeker.findById(app.jobSeekerId).select("userId cv").lean();
  if (!seeker) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const wantCv = searchParams.get("cv") === "1";

  let url: string | undefined;
  let typeOrCategory: string | undefined;

  if (wantCv) {
    url = (seeker.cv as { originalUrl?: string } | undefined)?.originalUrl;
    typeOrCategory = "resume";
  } else {
    const idx = Number.parseInt(searchParams.get("i") ?? "", 10);
    const docs = (app.documents as { url?: string; type?: string }[] | undefined) ?? [];
    if (Number.isNaN(idx) || idx < 0 || idx >= docs.length) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    url = docs[idx]?.url;
    typeOrCategory = docs[idx]?.type;
  }

  if (!url) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const tier = classifyDocumentTier(typeOrCategory);
  const allowed = await canAccessApplicationDocument(ctx, {
    ownerUserId: String(seeker.userId),
    employerId: String(app.employerId),
    agentId: app.agentId ? String(app.agentId) : null,
    status: String(app.status),
    tier,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let signed: string;
  try {
    // `view=1` renders the file inline (in-app viewer); otherwise it downloads.
    const inline = searchParams.get("view") === "1";
    signed = await getPresignedUrl(urlToKey(url), 300, inline ? { inline: true } : undefined);
  } catch {
    return NextResponse.json({ error: "Could not generate download link" }, { status: 502 });
  }

  const res = NextResponse.redirect(signed, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const GET = withAuth(getHandler);
