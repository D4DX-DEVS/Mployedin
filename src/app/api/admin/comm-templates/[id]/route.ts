import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import BroadcastTemplate from "@/models/BroadcastTemplate";
import { validateBody } from "@/lib/validators";
import { broadcastTemplatePatchSchema } from "@/lib/validators/admin";
import mongoose from "mongoose";

interface AuthCtx { userId: string; role: string; locale: string; }

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!mongoose.Types.ObjectId.isValid(params?.id ?? "")) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await connectDB();
  const data = await validateBody(req, broadcastTemplatePatchSchema);
  const template = await BroadcastTemplate.findByIdAndUpdate(
    params!.id,
    { $set: data },
    { new: true }
  ).lean();
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!mongoose.Types.ObjectId.isValid(params?.id ?? "")) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await connectDB();
  const result = await BroadcastTemplate.findByIdAndDelete(params!.id).lean();
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler, { resource: "notifications", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "notifications", action: "delete" });
