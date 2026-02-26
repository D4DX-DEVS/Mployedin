import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: string; locale: string; }

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");
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

export const GET = withAuth(handler, { resource: "employers", action: "read" });
