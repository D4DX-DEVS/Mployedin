import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Agent from "@/models/Agent";
import User from "@/models/User";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { agentProfileUpdateSchema } from "@/lib/validators/settings";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const [profile, user] = await Promise.all([
    Agent.findOne({ userId: ctx.userId })
      .select("commissionRate currencyCode country")
      .lean(),
    User.findById(ctx.userId).select("name phone").lean(),
  ]);

  return NextResponse.json({
    profile: {
      commissionRate: profile?.commissionRate ?? 0,
      currencyCode: profile?.currencyCode ?? "AED",
      name: user?.name ?? "",
      phone: user?.phone ?? "",
    },
  });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await validateBody(req, agentProfileUpdateSchema);

  const userUpdates: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    userUpdates.name = body.name.trim();
  }
  if (typeof body.phone === "string") {
    userUpdates.phone = body.phone.trim();
  }

  if (Object.keys(userUpdates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await User.findByIdAndUpdate(ctx.userId, { $set: userUpdates }, { new: true })
    .select("name phone")
    .lean();

  // Return fresh combined profile
  const [profile, user] = await Promise.all([
    Agent.findOne({ userId: ctx.userId }).select("commissionRate").lean(),
    User.findById(ctx.userId).select("name phone").lean(),
  ]);

  return NextResponse.json({
    profile: {
      commissionRate: profile?.commissionRate ?? 0,
      name: user?.name ?? "",
      phone: user?.phone ?? "",
    },
  });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
