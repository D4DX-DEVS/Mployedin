import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentOwnRegion } from "@/lib/auth/agentRestrictions";
import { territoryLocationsResponse } from "@/lib/auth/territoryLocations";
import { isValidObjectId } from "@/lib/security/sanitize";
import logger from "@/lib/logger";

/**
 * GET /api/admin/super-agents/:id/territory/locations   (:id = the super-agent's user id)
 *
 * The location cascade narrowed to one super-agent's territory. Admin → Add /
 * Edit Agent points its region picker here once a super agent is chosen, so it
 * offers only places inside that territory — the POST/PATCH /api/admin/agents
 * subset check rejects anything else after the form has been filled.
 */
async function handler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();

  try {
    const region = await getSuperAgentOwnRegion(params!.id);
    return await territoryLocationsResponse(region, new URL(req.url).searchParams);
  } catch (err) {
    logger.error({ err }, "[admin/super-agents/territory/locations] Error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withAuth(handler);
