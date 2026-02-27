import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import City from "@/models/City";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ── GET /api/admin/location-data/cities/[id] ────────────────────────── */
async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  const { id } = params ?? {};
  await connectDB();
  const item = await City.findById(id)
    .populate({
      path: "stateId",
      select: "name nameAr countryId",
      populate: { path: "countryId", select: "name nameAr code" },
    })
    .lean();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

/* ── PATCH /api/admin/location-data/cities/[id] ──────────────────────── */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const { id } = params ?? {};
  await connectDB();

  const item = await City.findById(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "nameAr", "stateId", "slug", "sortOrder", "isActive"];

  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      update[k] = k === "slug" ? slugify(String(body[k])) : body[k];
    }
  }

  // If slug changed, check uniqueness
  if (update.slug && update.slug !== item.slug) {
    const dup = await City.findOne({ slug: update.slug, _id: { $ne: id } });
    if (dup) {
      return NextResponse.json({ error: `Slug "${update.slug}" already in use` }, { status: 409 });
    }
  }

  Object.assign(item, update);
  await item.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "city.update",
    resource: "location_data",
    resourceId: id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ item });
}

/* ── DELETE /api/admin/location-data/cities/[id] ─────────────────────── */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const { id } = params ?? {};
  await connectDB();

  const item = await City.findById(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await City.deleteOne({ _id: id });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "city.delete",
    resource: "location_data",
    resourceId: id,
    req,
  });

  return NextResponse.json({ message: "Deleted" });
}

export const GET = withAuth(getHandler, { resource: "location_data", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "location_data", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "location_data", action: "delete" });
