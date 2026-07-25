import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Agent from "@/models/Agent";
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
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const profile = await Agent.findOne({ userId: ctx.userId })
    .select("country currencyCode commissionRate timezone workingHoursStart workingHoursEnd workingDays")
    .lean();

  return NextResponse.json({
    settings: {
      country: profile?.country ?? "",
      currencyCode: profile?.currencyCode ?? "AED",
      commissionRate: profile?.commissionRate ?? 0,
      timezone: profile?.timezone ?? "Asia/Dubai",
      workingHoursStart: profile?.workingHoursStart ?? "09:00",
      workingHoursEnd: profile?.workingHoursEnd ?? "18:00",
      workingDays: profile?.workingDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"],
    },
  });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
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

  if (body.timezone != null) updates.timezone = body.timezone;
  if (body.workingHoursStart != null) updates.workingHoursStart = body.workingHoursStart;
  if (body.workingHoursEnd != null) updates.workingHoursEnd = body.workingHoursEnd;
  if (body.workingDays != null) updates.workingDays = body.workingDays;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const profile = await Agent.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: updates },
    { returnDocument: "after" }
  )
    .select("country currencyCode commissionRate timezone workingHoursStart workingHoursEnd workingDays")
    .lean();

  if (!profile) {
    return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    settings: {
      country: profile.country ?? "",
      currencyCode: profile.currencyCode ?? "AED",
      commissionRate: profile.commissionRate ?? 0,
      timezone: profile.timezone ?? "Asia/Dubai",
      workingHoursStart: profile.workingHoursStart ?? "09:00",
      workingHoursEnd: profile.workingHoursEnd ?? "18:00",
      workingDays: profile.workingDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"],
    },
  });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
