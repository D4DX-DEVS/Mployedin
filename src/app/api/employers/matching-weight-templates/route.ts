import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import connectDB from "@/lib/db/mongoose";
import MatchingWeightTemplate from "@/models/MatchingWeightTemplate";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { matchingWeightTemplateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { sanitizeMatchingWeights } from "@/lib/ai/matchingWeights";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET — list all matching weight templates available to this employer:
 *   1. All system templates (scope: "system")
 *   2. Employer's own custom templates (scope: "employer", employerId matches)
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const templates = await MatchingWeightTemplate.find({
    $or: [
      { scope: "system" },
      { scope: "employer", employerId: employer._id },
    ],
  })
    .sort({ scope: 1, isDefault: -1, createdAt: -1 })
    .lean();

  // Legacy templates may still carry the old 8-key weight shape.
  const sanitized = templates.map((t) => ({ ...t, weights: sanitizeMatchingWeights(t.weights) }));
  return NextResponse.json({ templates: sanitized });
}

/** POST — employer creates a custom matching weight template */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await validateBody(req, matchingWeightTemplateSchema);

  const total = Object.values(body.weights).reduce((a: number, b: number) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    return NextResponse.json({ error: `Weights must total 100 (got ${total})` }, { status: 400 });
  }

  const template = await MatchingWeightTemplate.create({
    ...body,
    scope: "employer",
    employerId: employer._id,
    createdBy: ctx.userId,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "matching_weight_template.create",
    resource: "matching_weight_templates",
    resourceId: template._id.toString(),
    meta: { name: body.name },
    req,
  });

  return NextResponse.json({ template }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
// Listing stays open (system templates feed the job form); authoring a custom
// template is the `matchingWeightCustomization` entitlement.
export const POST = withAuth(
  withSubscription(postHandler, { type: "toggle", feature: "matchingWeightCustomization" }),
  { resource: "employers", action: "update" },
);
