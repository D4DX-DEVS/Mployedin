/**
 * POST /api/admin/webhooks/[id]/rotate-secret — Regenerate the signing secret
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Webhook from "@/models/Webhook";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: string; locale: string }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const segments = req.nextUrl.pathname.split("/");
  const id = segments[segments.indexOf("webhooks") + 1];
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  await connectDB();
  const newSecret = crypto.randomBytes(32).toString("hex");

  const webhook = await Webhook.findByIdAndUpdate(
    id,
    { $set: { secret: newSecret } },
    { returnDocument: "after" },
  ).lean();

  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "webhook.rotate_secret",
    resource: "settings",
    resourceId: id!,
    req,
  });

  return NextResponse.json({ secret: newSecret });
}

export const POST = withAuth(postHandler, { resource: "users", action: "update" });
