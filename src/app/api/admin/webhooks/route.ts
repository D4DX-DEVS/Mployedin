/**
 * GET  /api/admin/webhooks — List all webhooks
 * POST /api/admin/webhooks — Create a webhook
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { webhookCreateSchema } from "@/lib/validators/webhooks";
import Webhook from "@/models/Webhook";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: string; locale: string }

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const webhooks = await Webhook.find()
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ webhooks });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, webhookCreateSchema);

  // Auto-generate secret if not provided
  const secret = body.secret ?? crypto.randomBytes(32).toString("hex");

  const webhook = await Webhook.create({
    ...body,
    secret,
    createdBy: ctx.userId,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "webhook.create",
    resource: "settings",
    resourceId: String(webhook._id),
    req,
  });

  return NextResponse.json({
    webhook: {
      ...webhook.toObject(),
      secret, // Return secret only on creation
    },
  }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "create" });
