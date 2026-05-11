import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SystemSettings from "@/models/SystemSettings";

/**
 * GET /api/settings/public
 * Returns non-sensitive platform settings (defaultCurrency, platformName).
 * Accessible by any authenticated user.
 */
async function handler() {
  await connectDB();
  const settings = await SystemSettings.findOne()
    .select("defaultCurrency platformName")
    .lean();

  return NextResponse.json({
    settings: {
      defaultCurrency: settings?.defaultCurrency ?? "AED",
      platformName: settings?.platformName ?? "MPLOYEDIN",
    },
  });
}

export const GET = withAuth(handler, { resource: "notifications", action: "read" });
