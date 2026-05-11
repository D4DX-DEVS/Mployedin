import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Target from "@/models/Target";
import { enrichTargetWithAchievement } from "@/lib/targets/achievementCalculator";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/agent/targets — own targets with achievements           */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = searchParams.get("month");
  const type = searchParams.get("type");

  const query: Record<string, unknown> = {
    assigneeId: ctx.userId,
    assigneeRole: "agent",
    year,
    status: { $ne: "cancelled" },
  };
  if (month && month !== "all") query.month = parseInt(month);
  if (type && type !== "all") query.type = type;

  const targets = await Target.find(query).sort({ month: 1, type: 1 }).lean();
  const enriched = await Promise.all(
    targets.map((t) => enrichTargetWithAchievement(t))
  );

  // Build summary cards
  const currentMonth = new Date().getMonth() + 1;
  const summaryTypes = ["employer", "employee", "finance"] as const;
  const summary = summaryTypes.map((sType) => {
    const monthlyTarget = enriched.find(
      (t) => t.type === sType && t.month === currentMonth
    );
    const yearlyTarget = enriched.find(
      (t) => t.type === sType && !t.month
    );

    return {
      type: sType,
      monthly: monthlyTarget
        ? { target: monthlyTarget.targetValue, achieved: monthlyTarget.achieved, progress: monthlyTarget.progress }
        : null,
      yearly: yearlyTarget
        ? { target: yearlyTarget.targetValue, achieved: yearlyTarget.achieved, progress: yearlyTarget.progress }
        : null,
    };
  });

  return NextResponse.json({ targets: enriched, summary });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
