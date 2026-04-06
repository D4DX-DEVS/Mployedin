import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { getCategory } from "@/lib/job-attributes/categoryResolver";
import { escapeRegex } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { jobAttributeCreateSchema } from "@/lib/validators/location-data";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function handler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const category = params?.category;
  if (!category) {
    return NextResponse.json({ error: "Category is required" }, { status: 400 });
  }

  const meta = getCategory(category);
  if (!meta) {
    return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 404 });
  }

  await connectDB();
  const Model = await meta.model();

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
      { slug: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Model.find(query).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const category = params?.category;
  if (!category) {
    return NextResponse.json({ error: "Category is required" }, { status: 400 });
  }

  const meta = getCategory(category);
  if (!meta) {
    return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 404 });
  }

  await connectDB();
  const Model = await meta.model();
  const body = await validateBody(req, jobAttributeCreateSchema);

  const { name, nameAr, slug: customSlug, sortOrder, isActive } = body;
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = customSlug ? slugify(customSlug) : slugify(name);

  // Check uniqueness
  const existing = await Model.findOne({ slug });
  if (existing) {
    return NextResponse.json({ error: `An entry with slug "${slug}" already exists` }, { status: 409 });
  }

  const item = await Model.create({
    name: name.trim(),
    nameAr: (nameAr ?? "").trim(),
    slug,
    sortOrder: sortOrder ?? 0,
    isActive: isActive !== false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: `${category}.create`,
    resource: "job_attributes",
    resourceId: item._id?.toString(),
    changes: { after: { name, slug, category } },
    req,
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "job_attributes", action: "read" });
export const POST = withAuth(postHandler, { resource: "job_attributes", action: "create" });
