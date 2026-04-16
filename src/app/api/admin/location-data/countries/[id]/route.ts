import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import Country from "@/models/Country";
import { validateBody } from "@/lib/validators";
import { countryUpdateSchema } from "@/lib/validators/location-data";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/* ── GET /api/admin/location-data/countries/[id] ────────────────────── */
async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  const { id } = params ?? {};
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const item = await Country.findById(id).lean();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

/* ── PATCH /api/admin/location-data/countries/[id] ──────────────────── */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const { id } = params ?? {};
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const item = await Country.findById(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await validateBody(req, countryUpdateSchema) as Record<string, unknown>;
  const allowed = [
    "name", "nameAr", "code", "phoneCode", "currency",
    "currencyCode", "currencySymbol", "thousandSeparator",
    "decimalSeparator", "sortOrder", "isActive",
  ];

  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      update[k] = k === "code" ? String(body[k]).toUpperCase().trim()
        : k === "currencyCode" ? String(body[k]).toUpperCase().trim()
        : body[k];
    }
  }

  // If code changed, check uniqueness
  if (update.code && update.code !== item.code) {
    const dup = await Country.findOne({ code: update.code, _id: { $ne: id } });
    if (dup) {
      return NextResponse.json({ error: `Code "${update.code}" already in use` }, { status: 409 });
    }
  }

  Object.assign(item, update);
  await item.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "country.update",
    resource: "location_data",
    resourceId: id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ item });
}

/* ── DELETE /api/admin/location-data/countries/[id] ─────────────────── */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const { id } = params ?? {};
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const item = await Country.findById(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await Country.deleteOne({ _id: id });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "country.delete",
    resource: "location_data",
    resourceId: id,
    req,
  });

  return NextResponse.json({ message: "Deleted" });
}

export const GET = withAuth(getHandler, { resource: "location_data", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "location_data", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "location_data", action: "delete" });
