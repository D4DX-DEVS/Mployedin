import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { broadcastRecipientQuery, parseBroadcastRoles } from "@/lib/communications/broadcastAudience";

interface AuthCtx { userId: string; role: string; locale: string; }

/**
 * GET /api/admin/communications/audience?roles=employer,agent
 *
 * How many active users a broadcast would reach, so the admin confirms a real
 * number before sending. No roles (or none valid) = every active user.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const roles = parseBroadcastRoles(req.nextUrl.searchParams.get("roles"));
  await connectDB();
  const count = await User.countDocuments(broadcastRecipientQuery(roles.length === 0, roles));
  return NextResponse.json({ count });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
