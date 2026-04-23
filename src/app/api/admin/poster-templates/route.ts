import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { PosterTemplate } from "@/models/PosterTemplate";
import { uploadBuffer } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";

const ADMIN_ROLES: UserRole[] = ["admin", "super_agent"];

/**
 * GET /api/admin/poster-templates
 * List all poster templates (paginated, filterable).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (!ADMIN_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const category = url.searchParams.get("category");
  const isActive = url.searchParams.get("isActive");

  const query: Record<string, unknown> = {};
  if (category) query.category = category;
  if (isActive === "true") query.isActive = true;
  if (isActive === "false") query.isActive = false;

  const [items, total] = await Promise.all([
    PosterTemplate.find(query)
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PosterTemplate.countDocuments(query),
  ]);

  return NextResponse.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
});

/**
 * POST /api/admin/poster-templates
 * Create a new poster template (multipart: images + JSON config).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (!ADMIN_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const formData = await req.formData();
  const name = (formData.get("name") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  const defaultAccentColor = (formData.get("defaultAccentColor") as string)?.trim() || "#6366F1";
  const textZonesRaw = formData.get("textZones") as string;

  if (!name || !category) {
    return NextResponse.json({ error: "Name and category are required." }, { status: 400 });
  }
  if (name.length > 100 || category.length > 50) {
    return NextResponse.json({ error: "Name or category too long." }, { status: 400 });
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(defaultAccentColor)) {
    return NextResponse.json({ error: "Invalid accent color." }, { status: 400 });
  }

  let textZones: Record<string, unknown[]>;
  try {
    textZones = JSON.parse(textZonesRaw || '{"landscape":[],"square":[],"story":[]}');
  } catch {
    return NextResponse.json({ error: "Invalid textZones JSON." }, { status: 400 });
  }

  // Upload background images
  const backgroundImages: Record<string, string> = {};
  for (const sizeKey of ["landscape", "square", "story"] as const) {
    const file = formData.get(`bg_${sizeKey}`) as File | null;
    if (file && file.size > 0) {
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: `${sizeKey} image exceeds 5MB.` }, { status: 400 });
      }
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        return NextResponse.json({ error: `${sizeKey} image must be PNG, JPEG, or WebP.` }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadBuffer(buffer, {
        folder: "media",
        fileName: `poster-template-${sizeKey}-${Date.now()}.${file.type.split("/")[1]}`,
        contentType: file.type,
        validateAs: "image",
      });
      backgroundImages[sizeKey] = result.url;
    }
  }

  const template = await PosterTemplate.create({
    name,
    category,
    backgroundImages,
    textZones: {
      landscape: textZones.landscape ?? [],
      square: textZones.square ?? [],
      story: textZones.story ?? [],
    },
    defaultAccentColor,
    createdBy: ctx.userId,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "poster_template.create",
    resource: "poster_template",
    resourceId: String(template._id),
    meta: { name, category },
    req,
  });

  return NextResponse.json({ template }, { status: 201 });
});
