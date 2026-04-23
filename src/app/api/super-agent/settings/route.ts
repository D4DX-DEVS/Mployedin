import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SuperAgent from "@/models/SuperAgent";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { agentSettingsUpdateSchema } from "@/lib/validators/settings";

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
    .select("country currencyCode overrideRate")
    .lean();

  return NextResponse.json({
    settings: {
      country: profile?.country ?? "",
      currencyCode: profile?.currencyCode ?? "AED",
      overrideRate: profile?.overrideRate ?? 0,
    },
  });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await validateBody(req, agentSettingsUpdateSchema);

  const updates: Record<string, unknown> = {};

  if (body.country != null) {
    updates.country = body.country;
  }

  if (body.currencyCode != null) {
    const valid = SUPPORTED_CURRENCIES.some((c) => c.code === body.currencyCode);
    if (!valid) {
      return NextResponse.json({ error: "Unsupported currency code" }, { status: 400 });
    }
    updates.currencyCode = body.currencyCode;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const profile = await SuperAgent.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: updates },
    { new: true }
  )
    .select("country currencyCode overrideRate")
    .lean();

  if (!profile) {
    return NextResponse.json({ error: "Super agent profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    settings: {
      country: profile.country ?? "",
      currencyCode: profile.currencyCode ?? "AED",
      overrideRate: profile.overrideRate ?? 0,
    },
  });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
