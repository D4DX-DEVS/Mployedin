/**
 * GET    /api/admin/webhooks/[id] — Single webhook with delivery log
 * PATCH  /api/admin/webhooks/[id] — Update webhook
 * DELETE /api/admin/webhooks/[id] — Delete webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { webhookUpdateSchema } from "@/lib/validators/webhooks";
import Webhook from "@/models/Webhook";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: string; locale: string }

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.pathname.split("/").pop();
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  await connectDB();
  const webhook = await Webhook.findById(id).lean();
  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  return NextResponse.json({ webhook });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.pathname.split("/").pop();
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  await connectDB();
  const body = await validateBody(req, webhookUpdateSchema);

  const webhook = await Webhook.findByIdAndUpdate(
    id,
    { $set: body },
    { new: true },
  ).lean();

  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "webhook.update",
    resource: "settings",
    resourceId: id!,
    req,
  });

  return NextResponse.json({ webhook });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.pathname.split("/").pop();
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  await connectDB();
  const webhook = await Webhook.findByIdAndDelete(id);
  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "webhook.delete",
    resource: "settings",
    resourceId: id!,
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "users", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "users", action: "delete" });
