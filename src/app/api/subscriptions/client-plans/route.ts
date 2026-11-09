/**
 * GET /api/subscriptions/client-plans?userIds=a,b,c
 *
 * The current plan of each listed employer account, for the agent and
 * super-agent employer lists. Ids outside the caller's scope are dropped
 * silently (default-deny), so the response never confirms they exist.
 */
import { NextRequest, NextResponse } from "next/server";
import type mongoose from "mongoose";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { commonSchemas } from "@/lib/validators";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import { Employer } from "@/models/Employer";
import type { UserRole } from "@/types/user";
import type { ClientPlan } from "@/lib/subscription/clientPlan";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const idsSchema = z.array(commonSchemas.objectId).min(1).max(100);

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "agent", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const raw = (req.nextUrl.searchParams.get("userIds") ?? "").split(",").filter(Boolean);
  const parsed = idsSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Pass 1–100 user ids in userIds" }, { status: 400 });

  await connectDB();
  let allowed = parsed.data;
  const scoped = await getScopedEmployerIds(ctx);
  if (scoped !== null) {
    if (scoped.length === 0) return NextResponse.json({ plans: [] });
    const inScope = await Employer.find({ _id: { $in: scoped }, userId: { $in: parsed.data } })
      .select("userId").lean<{ userId: mongoose.Types.ObjectId }[]>();
    allowed = inScope.map((e) => String(e.userId));
    if (allowed.length === 0) return NextResponse.json({ plans: [] });
  }

  const subs = await Subscription.find({ userId: { $in: allowed }, targetRole: "employer", status: "active" })
    .select("userId planSnapshot.name planSnapshot.tier planSnapshot.price planSnapshot.currency endDate")
    .lean<{ userId: mongoose.Types.ObjectId; endDate: Date; planSnapshot?: { name?: string; tier?: number; price?: number; currency?: string } }[]>();

  const plans: ClientPlan[] = subs.map((s) => ({
    userId: String(s.userId),
    planName: s.planSnapshot?.name ?? "",
    tier: s.planSnapshot?.tier ?? 0,
    price: s.planSnapshot?.price ?? 0,
    currency: s.planSnapshot?.currency ?? "AED",
    endDate: s.endDate.toISOString(),
  }));
  return NextResponse.json({ plans });
}

export const GET = withAuth(handler, { resource: "subscriptions", action: "read" });
