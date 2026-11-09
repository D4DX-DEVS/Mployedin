import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { buildMarketGaps } from "@/lib/marketGaps/build";
import logger from "@/lib/logger";

export const maxDuration = 300;

/** Nightly: recompute the market gaps the admin Market gaps tab reads. */
export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;
  await connectDB();
  try {
    const result = await buildMarketGaps("cron");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "[cron:market-gaps] build failed");
    return NextResponse.json({ ok: false, error: "Build failed" }, { status: 500 });
  }
}
