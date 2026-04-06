import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import Country from "@/models/Country";
import { validateBody } from "@/lib/validators";
import { countryCreateSchema } from "@/lib/validators/location-data";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/* ── GET /api/admin/location-data/countries ─────────────────────────── */
async function handler(req: NextRequest, ctx: AuthCtx) {
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
      { name: { $regex: safe, $options: "i" } },
      { nameAr: { $regex: safe, $options: "i" } },
      { code: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Country.find(query).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit).lean(),
    Country.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/* ── POST /api/admin/location-data/countries ────────────────────────── */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, countryCreateSchema);

  const { name, nameAr, code, phoneCode, currency, currencyCode, currencySymbol, thousandSeparator, decimalSeparator, sortOrder, isActive } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "Name and code are required" }, { status: 400 });
  }

  // Check uniqueness
  const existing = await Country.findOne({ code: code.toUpperCase().trim() });
  if (existing) {
    return NextResponse.json({ error: `Country with code "${code}" already exists` }, { status: 409 });
  }

  const item = await Country.create({
    name: name.trim(),
    nameAr: (nameAr ?? "").trim(),
    code: code.toUpperCase().trim(),
    phoneCode: (phoneCode ?? "").trim(),
    currency: (currency ?? "").trim(),
    currencyCode: (currencyCode ?? "").toUpperCase().trim(),
    currencySymbol: (currencySymbol ?? "").trim(),
    thousandSeparator: thousandSeparator ?? ",",
    decimalSeparator: decimalSeparator ?? ".",
    sortOrder: sortOrder ?? 0,
    isActive: isActive !== false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "country.create",
    resource: "location_data",
    resourceId: item._id?.toString(),
    changes: { after: { name, code } },
    req,
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "location_data", action: "read" });
export const POST = withAuth(postHandler, { resource: "location_data", action: "create" });
