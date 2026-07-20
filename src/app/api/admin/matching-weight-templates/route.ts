import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import MatchingWeightTemplate from "@/models/MatchingWeightTemplate";
import { validateBody } from "@/lib/validators";
import { matchingWeightTemplateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { sanitizeMatchingWeights } from "@/lib/ai/matchingWeights";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** GET — list all system matching weight templates */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const templates = await MatchingWeightTemplate.find({ scope: "system" })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  // Legacy templates may still carry the old 8-key weight shape.
  const sanitized = templates.map((t) => ({ ...t, weights: sanitizeMatchingWeights(t.weights) }));
  return NextResponse.json({ templates: sanitized });
}

/** POST — create a new system matching weight template */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const body = await validateBody(req, matchingWeightTemplateSchema);

  // Validate total = 100
  const total = Object.values(body.weights).reduce((a: number, b: number) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    return NextResponse.json({ error: `Weights must total 100 (got ${total})` }, { status: 400 });
  }

  const template = await MatchingWeightTemplate.create({
    ...body,
    scope: "system",
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

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "create" });
