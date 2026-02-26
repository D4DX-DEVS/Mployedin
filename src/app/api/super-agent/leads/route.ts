import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const status = searchParams.get("status");
  const agentId = searchParams.get("agentId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { superAgentId: ctx.userId };
  if (status) filter.status = status;
  if (agentId) filter.agentId = agentId;

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .populate("agentId", "userId")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}, { resource: "leads", action: "read" });
