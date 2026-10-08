/**
 * DELETE /api/admin/ai-access/[id] — revoke a platform AI Data Access key.
 * Soft revoke (isActive=false + revokedAt) so the audit trail keeps its key id.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import PlatformApiKey from "@/models/PlatformApiKey";

interface AuthCtx { userId: string; role: string; locale: string }

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid key ID" }, { status: 400 });
  }

  await connectDB();
  const key = await PlatformApiKey.findOneAndUpdate(
    { _id: id, isActive: true },
    { $set: { isActive: false, revokedAt: new Date(), revokedBy: new mongoose.Types.ObjectId(ctx.userId) } },
    { new: true },
  )
    .select("name keyPrefix isActive revokedAt")
    .lean();

  if (!key) {
    return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "insights.key_revoke",
    resource: "insights",
    resourceId: String(id),
    meta: { name: key.name, keyPrefix: key.keyPrefix },
    req,
  });

  return NextResponse.json({ key });
}

export const DELETE = withAuth(deleteHandler, { resource: "insights", action: "delete" });
