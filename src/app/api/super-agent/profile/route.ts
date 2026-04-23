import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { superAgentProfileUpdateSchema } from "@/lib/validators/settings";

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
    .select("overrideRate commissions currencyCode country")
    .lean();

  if (!profile) {
    return NextResponse.json({
      profile: { overrideRate: 0, commissions: { total: 0, pending: 0, paid: 0 }, currencyCode: "AED" },
    });
  }

  return NextResponse.json({ profile });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await validateBody(req, superAgentProfileUpdateSchema);

  const updates: Record<string, unknown> = {};
  if (body.overrideRate != null) {
    updates.overrideRate = body.overrideRate;
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
