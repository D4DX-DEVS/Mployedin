import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import StaticPage from "@/models/StaticPage";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { staticPageCreateSchema } from "@/lib/validators/cms";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10")));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { title: { $regex: safe, $options: "i" } },
      { titleAr: { $regex: safe, $options: "i" } },
      { slug: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    StaticPage.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    StaticPage.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, staticPageCreateSchema);

  const { title, titleAr, slug: customSlug, body: pageBody, bodyAr, isActive } = body;
  if (!title || !pageBody) {
    return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
  }

  const slug = customSlug ? slugify(customSlug) : slugify(title);

  const existing = await StaticPage.findOne({ slug });
  if (existing) {
    return NextResponse.json({ error: `A page with slug "${slug}" already exists` }, { status: 409 });
  }

  const item = await StaticPage.create({
    slug,
    title: title.trim(),
    titleAr: (titleAr ?? "").trim(),
    body: pageBody,
    bodyAr: bodyAr ?? "",
    isActive: isActive !== false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "static-page.create",
    resource: "cms",
    resourceId: item._id?.toString(),
    changes: { after: { title, slug } },
    req,
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
export const POST = withAuth(postHandler, { resource: "cms", action: "create" });
