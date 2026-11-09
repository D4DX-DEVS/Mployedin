import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import MarketGapSnapshot from "@/models/MarketGapSnapshot";
import { buildMarketGaps } from "@/lib/marketGaps/build";
import logger from "@/lib/logger";

/** Longest an admin may ask for a rebuild again; the build reads every active seeker. */
const MIN_GAP_MS = 10 * 60 * 1000;

/** POST /api/admin/market-gaps/refresh — recompute now (admin only, once per 10 minutes). */
export const POST = withAuth(async (_req, ctx) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const last = await MarketGapSnapshot.findOne().sort({ generatedAt: -1 }).select("generatedAt").lean<{ generatedAt: Date } | null>();
  if (last && Date.now() - last.generatedAt.getTime() < MIN_GAP_MS) {
    const wait = Math.ceil((MIN_GAP_MS - (Date.now() - last.generatedAt.getTime())) / 1000);
    return NextResponse.json({ error: "RECENTLY_REFRESHED", retryAfter: wait }, { status: 429, headers: { "Retry-After": String(wait) } });
  }
  try {
    return NextResponse.json({ ok: true, ...(await buildMarketGaps("manual")) });
  } catch (err) {
    logger.error({ err }, "[market-gaps] manual build failed");
    return NextResponse.json({ error: "Build failed" }, { status: 500 });
  }
});
