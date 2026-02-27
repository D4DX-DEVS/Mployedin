import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import State from "@/models/State";

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

/* ── GET /api/admin/location-data/states ────────────────────────────── */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const countryId = searchParams.get("countryId") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10")));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};

  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  if (countryId) query.countryId = countryId;

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { name: { $regex: safe, $options: "i" } },
      { nameAr: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    State.find(query)
      .populate("countryId", "name nameAr code")
      .sort({ sortOrder: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    State.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/* ── POST /api/admin/location-data/states ───────────────────────────── */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await req.json();

  const { name, nameAr, countryId, slug: customSlug, sortOrder, isActive } = body;

  if (!name || !countryId) {
    return NextResponse.json({ error: "Name and country are required" }, { status: 400 });
  }

  const slug = customSlug ? slugify(customSlug) : slugify(name);

  // Check uniqueness
  const existing = await State.findOne({ slug });
  if (existing) {
    return NextResponse.json({ error: `State with slug "${slug}" already exists` }, { status: 409 });
  }

  const item = await State.create({
    name: name.trim(),
    nameAr: (nameAr ?? "").trim(),
    countryId,
    slug,
    sortOrder: sortOrder ?? 0,
    isActive: isActive !== false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "state.create",
    resource: "location_data",
    resourceId: item._id?.toString(),
    changes: { after: { name, slug, countryId } },
    req,
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "location_data", action: "read" });
export const POST = withAuth(postHandler, { resource: "location_data", action: "create" });
