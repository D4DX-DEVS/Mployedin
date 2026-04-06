import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Video from "@/models/Video";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { videoCreateSchema } from "@/lib/validators/cms";

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
    Video.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Video.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, videoCreateSchema);

  const { title, titleAr, description, descriptionAr, url, thumbnail, sortOrder, isActive } = body;
  if (!title || !url) {
    return NextResponse.json({ error: "Title and URL are required" }, { status: 400 });
  }

  const item = await Video.create({
    title: title.trim(),
    titleAr: (titleAr ?? "").trim(),
    description: (description ?? "").trim(),
    descriptionAr: (descriptionAr ?? "").trim(),
    url: url.trim(),
    thumbnail: thumbnail ?? "",
    sortOrder: sortOrder ?? 0,
    isActive: isActive !== false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "video.create",
    resource: "cms",
    resourceId: item._id?.toString(),
    changes: { after: { title, url } },
    req,
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
export const POST = withAuth(postHandler, { resource: "cms", action: "create" });
