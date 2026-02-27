import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Placement from "@/models/Placement";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const placement = await Placement.findById(params?.id)
    .populate("jobId", "title location")
    .populate({ path: "jobSeekerId", populate: { path: "userId", select: "name email" } })
    .lean();
  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  return NextResponse.json({ placement });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const placement = await Placement.findById(params?.id);
  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

  const body = await req.json();
  const allowed = ["startDate", "salary", "currency", "visaStatus", "commissionPaid", "commissionAmount", "notes"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];

  Object.assign(placement, update);
  await placement.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "placement.update",
    resource: "placements",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ placement });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const placement = await Placement.findById(params?.id);
  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

  await Placement.findByIdAndDelete(params?.id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "placement.delete",
    resource: "placements",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Placement deleted" });
}

export const GET = withAuth(getHandler, { resource: "placements", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "placements", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "placements", action: "delete" });
