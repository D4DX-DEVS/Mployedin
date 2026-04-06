import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Testimonial from "@/models/Testimonial";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { testimonialCreateSchema } from "@/lib/validators/cms";

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
      { name: { $regex: safe, $options: "i" } },
      { company: { $regex: safe, $options: "i" } },
      { quote: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Testimonial.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Testimonial.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, testimonialCreateSchema);

  const { name, nameAr, designation, designationAr, company, companyAr, quote, quoteAr, avatar, rating, sortOrder, isActive } = body;
  if (!name || !quote) {
    return NextResponse.json({ error: "Name and quote are required" }, { status: 400 });
  }

  const item = await Testimonial.create({
    name: name.trim(),
    nameAr: (nameAr ?? "").trim(),
    designation: (designation ?? "").trim(),
    designationAr: (designationAr ?? "").trim(),
    company: (company ?? "").trim(),
    companyAr: (companyAr ?? "").trim(),
    quote: quote.trim(),
    quoteAr: (quoteAr ?? "").trim(),
    avatar: avatar ?? "",
    rating: rating ?? 5,
    sortOrder: sortOrder ?? 0,
    isActive: isActive !== false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "testimonial.create",
    resource: "cms",
    resourceId: item._id?.toString(),
    changes: { after: { name, company } },
    req,
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
export const POST = withAuth(postHandler, { resource: "cms", action: "create" });
