import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { matchingWeightsSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

import { sanitizeMatchingWeights } from "@/lib/ai/matchingWeights";

async function GET(_req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("matchingWeights").lean();

  return NextResponse.json({ weights: sanitizeMatchingWeights(employer?.matchingWeights) });
}

async function PATCH(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const { weights } = await validateBody(req, matchingWeightsSchema);

  // Validate total = 100
  const total = Object.values(weights as Record<string, number>).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    return NextResponse.json({ error: `Weights must total 100 (got ${total})` }, { status: 400 });
  }

  await Employer.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: { matchingWeights: weights } },
    { upsert: true }
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.update_matching_weights",
    resource: "employers",
    resourceId: ctx.userId,
    meta: { weights },
    req,
  });

  return NextResponse.json({ success: true });
}

const GET_handler = withAuth(GET, { resource: "employers", action: "read" });
const PATCH_handler = withAuth(PATCH, { resource: "employers", action: "update" });
export { GET_handler as GET, PATCH_handler as PATCH };
