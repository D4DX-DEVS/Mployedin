import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Banner from "@/models/Banner";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

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
    ];
  }

  const [items, total] = await Promise.all([
    Banner.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Banner.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await req.json();

  const { title, titleAr, subtitle, subtitleAr, image, imageMobile, linkUrl, linkText, linkTextAr, sortOrder, isActive } = body;
  if (!image) {
    return NextResponse.json({ error: "Banner image URL is required" }, { status: 400 });
  }

  const item = await Banner.create({
    title: (title ?? "").trim(),
    titleAr: (titleAr ?? "").trim(),
    subtitle: (subtitle ?? "").trim(),
    subtitleAr: (subtitleAr ?? "").trim(),
    image,
    imageMobile: imageMobile ?? "",
    linkUrl: (linkUrl ?? "").trim(),
    linkText: (linkText ?? "").trim(),
    linkTextAr: (linkTextAr ?? "").trim(),
    sortOrder: sortOrder ?? 0,
    isActive: isActive !== false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "banner.create",
    resource: "cms",
    resourceId: item._id?.toString(),
    changes: { after: { title, image } },
    req,
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
export const POST = withAuth(postHandler, { resource: "cms", action: "create" });
