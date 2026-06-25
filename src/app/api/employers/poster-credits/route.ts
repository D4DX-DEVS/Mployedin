import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { getCreditLimitForPlan, getNextResetDate, shouldResetCredits } from "@/lib/composer/credits";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/employers/poster-credits
 * Returns the employer's current poster credit balance.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select(
    "posterCredits subscriptionType"
  );
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const plan = employer.subscriptionType || "free";
  const limit = getCreditLimitForPlan(plan);

  // Initialize posterCredits if not set
  if (!employer.posterCredits) {
    employer.posterCredits = {
      used: 0,
      limit,
      resetDate: getNextResetDate(),
    };
    await employer.save();
  }

  // Auto-reset if past reset date
  if (shouldResetCredits(employer.posterCredits)) {
    employer.posterCredits.used = 0;
    employer.posterCredits.limit = limit;
    employer.posterCredits.resetDate = getNextResetDate();
    await employer.save();
  }

  // Sync limit with plan changes
  if (employer.posterCredits.limit !== limit) {
    employer.posterCredits.limit = limit;
    await employer.save();
  }

  return NextResponse.json({
    used: employer.posterCredits.used,
    limit: employer.posterCredits.limit,
    remaining: employer.posterCredits.limit - employer.posterCredits.used,
    resetDate: employer.posterCredits.resetDate,
    plan,
  });
}

export const GET = withAuth(getHandler);
