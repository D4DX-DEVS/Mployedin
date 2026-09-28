import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import StaticPage from "@/models/StaticPage";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { staticPageUpdateSchema } from "@/lib/validators/cms";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { isValidObjectId } from "@/lib/security/sanitize";
import { isLegalPageSlug } from "@/lib/cms/legalPages";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// Only the four legal pages are editable; an older page with any other slug
// (e.g. "Audit Dynamic Page") has no public route and stays out of reach.
async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const item = await StaticPage.findById(params?.id).lean();
  if (!item || !isLegalPageSlug(item.slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const item = await StaticPage.findById(params?.id);
  if (!item || !isLegalPageSlug(item.slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await validateBody(req, staticPageUpdateSchema) as Record<string, unknown>;
  // No slug: each legal page's public route reads it by slug, so a renamed
  // page silently fell back to "content is being prepared".
  const allowed = ["title", "titleAr", "body", "bodyAr", "isActive"];
  const htmlFields = new Set(["body", "bodyAr"]);
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      if (htmlFields.has(k)) update[k] = sanitizeHtml(String(body[k]));
      else update[k] = body[k];
    }
  }

  Object.assign(item, update);
  await item.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "static-page.update",
    resource: "cms",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ item });
}

// No DELETE: the four legal pages are fixed and nothing could re-create one.
export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "cms", action: "update" });
