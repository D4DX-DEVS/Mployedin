import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import AuditLog from "@/models/AuditLog";
import { escapeRegex, pick } from "@/lib/security/sanitize";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const filter: Record<string, unknown> = {};

  // Agents see only their leads; super-agents see territory leads (handled by territory)
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
  await connectDB();
  const body = await req.json();
  const allowed = pick(body as Record<string, unknown>, [
    "companyName", "contactName", "email", "phone",
    "industry", "notes", "source", "territory",
  ]);
  const lead = await Lead.create({
    ...allowed,
    assignedAgentId: ctx.userId,
    status: "new",
  });

  await AuditLog.create({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "create",
    resource: "lead",
    resourceId: lead._id,
    ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
  });

  return NextResponse.json(lead, { status: 201 });
}, { resource: "leads", action: "create" });
