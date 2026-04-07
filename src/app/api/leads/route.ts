import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import { escapeRegex, pick } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { leadCreateSchema } from "@/lib/validators/leads";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const filter: Record<string, unknown> = {};

  // Agents see only their leads
  if (ctx.role === "agent") {
    filter.assignedAgentId = ctx.userId;
  }

  if (status) filter.status = status;
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { companyName: { $regex: safe, $options: "i" } },
      { contactName: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.leads);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const body = await validateBody(req, leadCreateSchema);
  const lead = await Lead.create({
    ...body,
    assignedAgentId: ctx.userId,
    status: "new",
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.create",
    resource: "leads",
    resourceId: String(lead._id),
    req,
  });

  return NextResponse.json(lead, { status: 201 });
}, { resource: "leads", action: "create" });
