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

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10")));
  const search = searchParams.get("search")?.trim();
  const status = searchParams.get("status");
  const event = searchParams.get("event");
  const query: Record<string, unknown> = {};
  if (search) {
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { name: { $regex: safeSearch, $options: "i" } },
      { url: { $regex: safeSearch, $options: "i" } },
    ];
  }
  if (status === "active") query.isActive = true;
  if (status === "inactive") query.isActive = false;
  if (event && event !== "all") query.events = event;

  const [webhooks, total, active, inactive, failed, healthy] = await Promise.all([
    Webhook.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Webhook.countDocuments(query),
    Webhook.countDocuments({ isActive: true }),
    Webhook.countDocuments({ isActive: false }),
    Webhook.countDocuments({ lastStatus: "failed" }),
    Webhook.countDocuments({ isActive: true, lastStatus: { $ne: "failed" } }),
  ]);

  return NextResponse.json({
    webhooks,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    stats: { active, inactive, failed, healthy },
  });
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
