import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Agent from "@/models/Agent";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import type { UserRole } from "@/models/User";

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
    .select("country currencyCode commissionRate")
    .lean();

  return NextResponse.json({
    settings: {
      country: profile?.country ?? "",
      currencyCode: profile?.currencyCode ?? "AED",
      commissionRate: profile?.commissionRate ?? 0,
    },
  });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  let body: { country?: string; currencyCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.country != null) {
    if (typeof body.country !== "string" || body.country.length > 5) {
      return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
    }
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

  const profile = await Agent.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: updates },
    { new: true }
  )
    .select("country currencyCode commissionRate")
    .lean();

  if (!profile) {
    return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
  }

  return NextResponse.json({
    settings: {
      country: profile.country ?? "",
      currencyCode: profile.currencyCode ?? "AED",
      commissionRate: profile.commissionRate ?? 0,
    },
  });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
