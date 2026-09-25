import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import type { UserRole } from "@/types/user";
import connectDB from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { matchingWeightsSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

import { sanitizeMatchingWeights } from "@/lib/ai/matchingWeights";
import Job from "@/models/Job";
import { queueApplicantRescore } from "@/lib/inngest/rescoreJobApplicants";
import logger from "@/lib/logger";

/** Jobs re-ranked when the company weights change; the rest re-rank on their next edit. */
const RESCORE_JOB_CAP = 200;

async function GET(_req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("matchingWeights").lean();

  return NextResponse.json({ weights: sanitizeMatchingWeights(employer?.matchingWeights) });
}

async function PATCH(req: NextRequest, ctx: { userId: string; role: UserRole }) {
  await connectDB();
  const { weights } = await validateBody(req, matchingWeightsSchema);

  // Validate total = 100
  const total = Object.values(weights as Record<string, number>).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    return NextResponse.json({ error: `Weights must total 100 (got ${total})` }, { status: 400 });
  }

  const employer = (await Employer.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: { matchingWeights: weights } },
    { upsert: true, returnDocument: "after", projection: { _id: 1 } }
  )) as { _id?: unknown } | null;

  // Company weights rank every job without its own override. Re-rank the
  // applicants those jobs already have; a job with its own weights is unmoved.
  if (employer?._id) {
    const jobs = await Job.find({
      employerId: employer._id,
      deletedAt: null,
      "applicantIds.0": { $exists: true },
      $or: [{ matchingWeights: { $exists: false } }, { matchingWeights: null }, { matchingWeights: {} }],
    })
      .select("_id")
      // Newest first: the jobs still hiring. Past the cap a job re-ranks on
      // its next edit or Score All; say so rather than leave it silent.
      .sort({ createdAt: -1 })
      .limit(RESCORE_JOB_CAP + 1)
      .lean();
    if (jobs.length > RESCORE_JOB_CAP) {
      logger.warn({ employerId: String(employer._id), cap: RESCORE_JOB_CAP }, "[matching-weights] rescore capped; older jobs keep their previous ranking");
    }
    await queueApplicantRescore(jobs.slice(0, RESCORE_JOB_CAP).map((job) => String(job._id)));
  }

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
// Reading the current weights stays open (the job form shows them); changing
// them is the `matchingWeightCustomization` entitlement.
const PATCH_handler = withAuth(
  withSubscription(PATCH, { type: "toggle", feature: "matchingWeightCustomization" }),
  { resource: "employers", action: "update" },
);
export { GET_handler as GET, PATCH_handler as PATCH };
