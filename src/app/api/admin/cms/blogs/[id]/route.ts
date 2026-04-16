import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import BlogPost from "@/models/BlogPost";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { blogUpdateSchema } from "@/lib/validators/cms";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const item = await BlogPost.findById(params?.id).lean();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const item = await BlogPost.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await validateBody(req, blogUpdateSchema) as Record<string, unknown>;
  const allowed = ["title", "titleAr", "slug", "excerpt", "excerptAr", "body", "bodyAr", "coverImage", "author", "tags", "status", "isActive"];
  const htmlFields = new Set(["excerpt", "excerptAr", "body", "bodyAr"]);
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      if (k === "slug") update[k] = slugify(String(body[k]));
      else if (htmlFields.has(k)) update[k] = sanitizeHtml(String(body[k]));
      else update[k] = body[k];
    }
  }

  // If publishing for the first time, set publishedAt
  if (update.status === "published" && item.status !== "published") {
    update.publishedAt = new Date();
  }

  // Check slug uniqueness if changed
  if (update.slug && update.slug !== item.slug) {
    const dup = await BlogPost.findOne({ slug: update.slug, _id: { $ne: params?.id } });
    if (dup) return NextResponse.json({ error: `Slug "${update.slug}" already in use` }, { status: 409 });
  }

  Object.assign(item, update);
  await item.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "blog.update",
    resource: "cms",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ item });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const item = await BlogPost.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await BlogPost.deleteOne({ _id: params?.id });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "blog.delete",
    resource: "cms",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Deleted" });
}

export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "cms", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "cms", action: "delete" });
