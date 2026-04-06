import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { employerAdminCreateSchema } from "@/lib/validators/employers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import bcrypt from "bcryptjs";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { role: "employer", isActive: true };
  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { name: { $regex: safe, $options: "i" } },
      { companyName: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
    ];
  }

  // Agents can only see employers assigned to them
  if (ctx.role === "agent") {
    query.assignedAgent = ctx.userId;
  }

  const [employers, total] = await Promise.all([
    User.find(query)
      .select("name email companyName industry location isActive createdAt")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return NextResponse.json({
    employers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.employers);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const body = await validateBody(req, employerAdminCreateSchema);
  const { name, email, password, companyName, industry, location, phone } = body;

  const existing = await User.findOne({ email });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: "employer",
    companyName,
    industry,
    location,
    phone,
    isActive: true,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.create",
    resource: "employers",
    resourceId: String(user._id),
    req,
  });

  return NextResponse.json({ employer: user }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "employers", action: "read" });
export const POST = withAuth(postHandler, { resource: "employers", action: "create" });
