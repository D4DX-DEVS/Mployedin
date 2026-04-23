import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { PosterTemplate } from "@/models/PosterTemplate";
import { uploadBuffer, deleteFile, urlToKey } from "@/lib/storage/spaces";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import mongoose from "mongoose";
import type { UserRole } from "@/types/user";

const ADMIN_ROLES: UserRole[] = ["admin", "super_agent"];

/**
 * GET /api/admin/poster-templates/[id]
 */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  if (!ADMIN_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  await connectDB();
  const template = await PosterTemplate.findById(id).lean();
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  return NextResponse.json({ template });
});

/**
 * PATCH /api/admin/poster-templates/[id]
 */
export const PATCH = withAuth(async (req: NextRequest, ctx, params) => {
  if (!ADMIN_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  await connectDB();
  const template = await PosterTemplate.findById(id);
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  if (isMultipart) {
    const formData = await req.formData();

    const name = formData.get("name") as string | null;
    const category = formData.get("category") as string | null;
    const defaultAccentColor = formData.get("defaultAccentColor") as string | null;
    const isActive = formData.get("isActive") as string | null;
    const sortOrder = formData.get("sortOrder") as string | null;
    const textZonesRaw = formData.get("textZones") as string | null;

    if (name?.trim()) template.name = name.trim().slice(0, 100);
    if (category?.trim()) template.category = category.trim().slice(0, 50);
    if (defaultAccentColor && /^#[0-9A-Fa-f]{6}$/.test(defaultAccentColor)) {
      template.defaultAccentColor = defaultAccentColor;
    }
    if (isActive === "true") template.isActive = true;
    if (isActive === "false") template.isActive = false;
    if (sortOrder) template.sortOrder = Number(sortOrder) || 0;

    if (textZonesRaw) {
      try {
        const zones = JSON.parse(textZonesRaw);
        if (zones.landscape) template.textZones.landscape = zones.landscape;
        if (zones.square) template.textZones.square = zones.square;
        if (zones.story) template.textZones.story = zones.story;
        template.markModified("textZones");
      } catch {
        return NextResponse.json({ error: "Invalid textZones JSON." }, { status: 400 });
      }
    }

    // Replace background images if new ones provided
    for (const sizeKey of ["landscape", "square", "story"] as const) {
      const file = formData.get(`bg_${sizeKey}`) as File | null;
      if (file && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: `${sizeKey} image exceeds 5MB.` }, { status: 400 });
        }
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
          return NextResponse.json({ error: `${sizeKey} must be PNG, JPEG, or WebP.` }, { status: 400 });
        }

        // Delete old image if it exists
        const oldUrl = template.backgroundImages[sizeKey];
        if (oldUrl) {
          try { await deleteFile(urlToKey(oldUrl)); } catch { /* ignore */ }
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadBuffer(buffer, {
          folder: "media",
          fileName: `poster-template-${sizeKey}-${Date.now()}.${file.type.split("/")[1]}`,
          contentType: file.type,
          validateAs: "image",
        });
        template.backgroundImages[sizeKey] = result.url;
        template.markModified("backgroundImages");
      }
    }
  } else {
    // JSON body — used for quick updates like toggling isActive
    const body = await req.json();
    if (body.name) template.name = String(body.name).trim().slice(0, 100);
    if (body.category) template.category = String(body.category).trim().slice(0, 50);
    if (body.defaultAccentColor && /^#[0-9A-Fa-f]{6}$/.test(body.defaultAccentColor)) {
      template.defaultAccentColor = body.defaultAccentColor;
    }
    if (typeof body.isActive === "boolean") template.isActive = body.isActive;
    if (typeof body.sortOrder === "number") template.sortOrder = body.sortOrder;
    if (body.textZones) {
      if (body.textZones.landscape) template.textZones.landscape = body.textZones.landscape;
      if (body.textZones.square) template.textZones.square = body.textZones.square;
      if (body.textZones.story) template.textZones.story = body.textZones.story;
      template.markModified("textZones");
    }
  }

  await template.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "poster_template.update",
    resource: "poster_template",
    resourceId: id,
    meta: { name: template.name },
    req,
  });

  return NextResponse.json({ template });
});

/**
 * DELETE /api/admin/poster-templates/[id]
 * Soft-delete: sets isActive to false.
 */
export const DELETE = withAuth(async (req: NextRequest, ctx, params) => {
  if (!ADMIN_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  await connectDB();
  const template = await PosterTemplate.findById(id);
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  template.isActive = false;
  await template.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "poster_template.delete",
    resource: "poster_template",
    resourceId: id,
    meta: { name: template.name },
    req,
  });

  return NextResponse.json({ success: true });
});
