import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import McpToken from "@/models/McpToken";
import { logActivity } from "@/lib/audit/log";
import { connectedAppsOwnerId } from "@/lib/mcp/connectedApps";

const FAMILY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/user/connected-apps/:id — disconnect one AI app. Revokes every
 * token in the grant, so the app's next call and its next refresh both fail.
 * Scoped to the signed-in user's own grants; another user's id is a 404.
 */
async function deleteHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  const familyId = params?.id ?? "";
  if (!FAMILY_ID_RE.test(familyId)) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  await connectDB();
  const ownerId = connectedAppsOwnerId(ctx);
  const result = await McpToken.updateMany(
    { familyId, userId: ownerId, isRevoked: false },
    { $set: { isRevoked: true } },
  );
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  await logActivity({
    actorId: ownerId,
    actorRole: ctx.role,
    action: "mcp.disconnected",
    resource: "auth",
    resourceId: familyId,
    req,
  });

  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(deleteHandler, { skipTenantView: true });
