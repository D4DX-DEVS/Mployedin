import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER, type ITargetPeriod } from "@/models/TargetProfile";
import { calculateKpis, type OwnerKpi, kpiOwnerKey } from "@/lib/targets/kpiCalculator";
import { defaultBounds } from "@/lib/targets/schedule";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

interface KpiTargetReportResponse {
  year: number;
  profile: {
    targetType: string;
    kpis: OwnerKpi;
    jobTarget: number | undefined;
    conversionTarget: number | undefined;
    revenueTarget: number | undefined;
    setByRole: string | undefined;
    overriddenByAdmin: boolean;
    currency: string;
    periods: Array<{
      startDate: string;
      endDate: string;
      jobTarget?: number;
      conversionTarget?: number;
      revenueTarget?: number;
    }>;
  } | null;
}

/* ------------------------------------------------------------------ */
/*  GET  /api/agent/target-report?year=                                */
/*  An agent's own KPI3 report (or profit report for legacy profiles). */
/*  There is no way to ask for anyone else's.                          */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;

  const profile = await TargetProfile.findOne({
    ...PROFIT_TARGET_FILTER,
    assigneeId: ctx.userId,
    assigneeRole: "agent",
    year,
    status: { $ne: "cancelled" },
  }).lean();

  if (!profile) {
    return NextResponse.json<KpiTargetReportResponse>({ year, profile: null });
  }

  // For kpi3 targets, fetch actuals using the calculator.
  if (profile.targetType === "kpi3") {
    const user = await User.findById(ctx.userId).select("currencyCode").lean();
    type UserDoc = { currencyCode?: string };
    const userDoc = user as UserDoc | null;
    const currency = userDoc?.currencyCode ?? profile.currency ?? "AED";

    const periods = defaultBounds(profile.periodType ?? "monthly", year);
    const kpiSource = {
      userId: ctx.userId,
      role: "agent" as const,
      currency,
      periods,
    };

    const kpiMap = await calculateKpis([kpiSource], year);
    const kpis = kpiMap.get(kpiOwnerKey("agent", ctx.userId));

    if (!kpis) {
      return NextResponse.json<KpiTargetReportResponse>({ year, profile: null });
    }

    const toISODateString = (date: Date | string): string => {
      if (typeof date === "string") return date;
      if (date instanceof Date) return date.toISOString().split("T")[0];
      return String(date);
    };

    const responseProfile = {
      targetType: "kpi3",
      kpis,
      jobTarget: profile.jobTarget,
      conversionTarget: profile.conversionTarget,
      revenueTarget: profile.revenueTarget,
      setByRole: profile.setByRole,
      overriddenByAdmin: profile.overriddenByAdmin || false,
      currency,
      periods: (profile.periods ?? []).map((p: ITargetPeriod) => ({
        startDate: toISODateString(p.startDate),
        endDate: toISODateString(p.endDate),
        jobTarget: p.jobTarget,
        conversionTarget: p.conversionTarget,
        revenueTarget: p.revenueTarget,
      })),
    };

    return NextResponse.json<KpiTargetReportResponse>({ year, profile: responseProfile });
  }

  // Fallback to null for other target types (profit should use the old endpoint)
  return NextResponse.json<KpiTargetReportResponse>({ year, profile: null });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
