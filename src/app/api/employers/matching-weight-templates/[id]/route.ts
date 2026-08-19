import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import MatchingWeightTemplate from "@/models/MatchingWeightTemplate";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { matchingWeightTemplateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import mongoose from "mongoose";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** GET — single template (must be system or belong to employer) */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const template = await MatchingWeightTemplate.findOne({
    _id: id,
    $or: [{ scope: "system" }, { scope: "employer", employerId: employer._id }],
  }).lean();

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

/** PATCH — only employer-owned templates can be edited */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await validateBody(req, matchingWeightTemplateSchema);

  const total = Object.values(body.weights).reduce((a: number, b: number) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    return NextResponse.json({ error: `Weights must total 100 (got ${total})` }, { status: 400 });
  }

  const template = await MatchingWeightTemplate.findOneAndUpdate(
    { _id: id, scope: "employer", employerId: employer._id },
    { $set: body },
    { returnDocument: "after" },
  );

  if (!template) {
    return NextResponse.json(
      { error: "Not found or cannot edit system templates" },
      { status: 404 },
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "matching_weight_template.update",
    resource: "matching_weight_templates",
    resourceId: id,
    meta: { name: body.name },
    req,
  });

  return NextResponse.json({ template });
}

/** DELETE — only employer-owned templates */
async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const deleted = await MatchingWeightTemplate.findOneAndDelete({
    _id: id,
    scope: "employer",
    employerId: employer._id,
  });

  if (!deleted) {
    return NextResponse.json(
      { error: "Not found or cannot delete system templates" },
      { status: 404 },
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "matching_weight_template.delete",
    resource: "matching_weight_templates",
    resourceId: id,
    req: _req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "delete" });
