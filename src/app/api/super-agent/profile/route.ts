import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
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
  const [profile, user] = await Promise.all([
    SuperAgent.findOne({ userId: ctx.userId })
      .select("overrideRate commissions currencyCode country")
      .lean(),
    User.findById(ctx.userId).select("name phone").lean(),
  ]);

  if (!profile) {
    return NextResponse.json({
      profile: {
        overrideRate: 0,
        commissions: { total: 0, pending: 0, paid: 0 },
        currencyCode: "AED",
        name: user?.name ?? "",
        phone: user?.phone ?? "",
      },
    });
  }

  return NextResponse.json({
    profile: {
      ...profile,
      name: user?.name ?? "",
      phone: user?.phone ?? "",
    },
  });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await validateBody(req, superAgentProfileUpdateSchema);

  const saUpdates: Record<string, unknown> = {};
  const userUpdates: Record<string, unknown> = {};

  if (body.overrideRate != null) {
    saUpdates.overrideRate = body.overrideRate;
  }
  if (typeof body.name === "string" && body.name.trim()) {
    userUpdates.name = body.name.trim();
  }
  if (typeof body.phone === "string") {
    userUpdates.phone = body.phone.trim();
  }

  const promises: Promise<unknown>[] = [];

  if (Object.keys(saUpdates).length > 0) {
    promises.push(
      SuperAgent.findOneAndUpdate(
        { userId: ctx.userId },
        { $set: saUpdates },
        { new: true },
      ).select("overrideRate commissions").lean(),
    );
  }

  if (Object.keys(userUpdates).length > 0) {
    promises.push(
      User.findByIdAndUpdate(ctx.userId, { $set: userUpdates }, { new: true })
        .select("name phone")
        .lean(),
    );
  }

  if (promises.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await Promise.all(promises);

  // Return fresh combined profile
  const [profile, user] = await Promise.all([
    SuperAgent.findOne({ userId: ctx.userId }).select("overrideRate commissions").lean(),
    User.findById(ctx.userId).select("name phone").lean(),
  ]);

  if (!profile) {
    return NextResponse.json({ error: "Super agent profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    profile: {
      ...profile,
      name: user?.name ?? "",
      phone: user?.phone ?? "",
    },
  });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
