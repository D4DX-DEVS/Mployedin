import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { parseBroadcastRoles, type BroadcastPurpose } from "@/lib/communications/broadcastAudience";
import { broadcastAudienceQuery } from "@/lib/communications/broadcastAudienceServer";

interface AuthCtx { userId: string; role: string; locale: string; }

/**
 * GET /api/admin/communications/audience?roles=employer,agent&purpose=marketing
 *
 * How many active users a broadcast would reach, so the admin confirms a real
 * number before sending. No roles (or none valid) = every active user.
 * purpose=marketing counts only users who opted in to marketing.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const roles = parseBroadcastRoles(req.nextUrl.searchParams.get("roles"));
  const purpose: BroadcastPurpose = req.nextUrl.searchParams.get("purpose") === "marketing" ? "marketing" : "service";
  await connectDB();
  const count = await User.countDocuments(await broadcastAudienceQuery(roles.length === 0, roles, purpose));
  return NextResponse.json({ count });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
