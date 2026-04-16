import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Territory from "@/models/Territory";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { escapeRegex } from "@/lib/security/sanitize";
import { z } from "zod";

interface AuthCtx { userId: string; role: string; locale: string; }

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  countries: z.array(z.string()).max(50).optional().default([]),
  superAgentId: z.string().optional(),
});

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));

  const query: Record<string, unknown> = {};
  if (search) {
    query.name = new RegExp(escapeRegex(search), "i");
  }

  const [items, total] = await Promise.all([
    Territory.find(query)
      .populate("superAgentId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Territory.countDocuments(query),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { name, countries, superAgentId } = parsed.data;

  const territory = await Territory.create({
    name,
    countries,
    superAgentId: superAgentId || null,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "territory.create",
    resource: "territories",
    resourceId: String(territory._id),
    meta: { name, countries },
    req,
  });

  return NextResponse.json({ territory }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "update" });
