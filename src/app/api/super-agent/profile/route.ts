import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const profile = await SuperAgent.findOne({ userId: ctx.userId })
    .select("overrideRate commissions")
    .lean();

  if (!profile) {
    return NextResponse.json({
      profile: { overrideRate: 0, commissions: { total: 0, pending: 0, paid: 0 } },
    });
  }

  return NextResponse.json({ profile });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  let body: { overrideRate?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.overrideRate != null) {
    const rate = Number(body.overrideRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return NextResponse.json({ error: "overrideRate must be 0–100" }, { status: 400 });
    }
    updates.overrideRate = rate;
  }

  const profile = await SuperAgent.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: updates },
    { new: true }
  )
    .select("overrideRate commissions")
    .lean();

  if (!profile) {
    return NextResponse.json({ error: "Super agent profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profile });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
