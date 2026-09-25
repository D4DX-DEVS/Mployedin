import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentOwnRegion } from "@/lib/auth/agentRestrictions";
import { territoryLocationsResponse } from "@/lib/auth/territoryLocations";
import logger from "@/lib/logger";

/**
 * GET /api/super-agent/territory/locations
 *
 * The location cascade narrowed to the calling super-agent's own territory, so
 * the region picker only offers places the POST /api/super-agent/agents subset
 * check will accept. Shape and fail-closed rules: territoryLocationsResponse.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  try {
    const region = await getSuperAgentOwnRegion(ctx.userId);
    return await territoryLocationsResponse(region, new URL(req.url).searchParams);
  } catch (err) {
    logger.error({ err }, "[super-agent/territory/locations] Error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withAuth(handler);
