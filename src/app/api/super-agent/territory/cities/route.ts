import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentOwnRegion } from "@/lib/auth/agentRestrictions";
import { listTerritoryCities } from "@/lib/agents/territoryCoverage";
import logger from "@/lib/logger";

/**
 * GET /api/super-agent/territory/cities
 *
 * Every city in the calling super-agent's own territory, flat, for the Add
 * Employer form: an employer placed in one of these cities is in the SA's
 * book (and every agent covering that city sees it too). Empty territory →
 * empty list.
 */
async function handler(_req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  try {
    const region = await getSuperAgentOwnRegion(ctx.userId);
    const cities = region ? await listTerritoryCities(region) : [];
    return NextResponse.json({ cities });
  } catch (err) {
    logger.error({ err }, "[super-agent/territory/cities] Error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withAuth(handler);
