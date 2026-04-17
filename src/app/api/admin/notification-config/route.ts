import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSystemConfig } from "@/models/SystemConfig";
import SystemConfig from "@/models/SystemConfig";

/**
 * GET /api/admin/notification-config
 * Returns the full SystemConfig (cron toggles, global defaults, user overrides).
 *
 * PATCH /api/admin/notification-config
 * Updates cron toggles, global defaults, or user overrides.
 */

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const config = await getSystemConfig();

  return NextResponse.json({ success: true, config });
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  // Toggle cron jobs
  if (body.cronJobs && typeof body.cronJobs === "object") {
    const validKeys = [
      "dailyRecommendations",
      "dailyDigestWorker",
      "reEngagement",
      "profileCompletion",
      "weeklyDigest",
      "jobExpiryAlerts",
    ];
    for (const key of validKeys) {
      if (key in body.cronJobs && typeof body.cronJobs[key]?.enabled === "boolean") {
        updates[`cronJobs.${key}.enabled`] = body.cronJobs[key].enabled;
      }
    }
  }

  // Global defaults
  if (body.globalDefaults && typeof body.globalDefaults === "object") {
    const gd = body.globalDefaults;
    if (typeof gd.maintenanceMode === "boolean") {
      updates["globalDefaults.maintenanceMode"] = gd.maintenanceMode;
    }
    if (gd.maintenanceMessage !== undefined) {
      updates["globalDefaults.maintenanceMessage"] = String(gd.maintenanceMessage).slice(0, 500);
    }
    if (gd.defaultFrequency && ["instant", "daily", "weekly", "none"].includes(gd.defaultFrequency)) {
      updates["globalDefaults.defaultFrequency"] = gd.defaultFrequency;
    }
    if (typeof gd.maxEmailsPerUserPerDay === "number" && gd.maxEmailsPerUserPerDay > 0 && gd.maxEmailsPerUserPerDay <= 100) {
      updates["globalDefaults.maxEmailsPerUserPerDay"] = gd.maxEmailsPerUserPerDay;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
  }

  updates["updatedBy"] = ctx.userId;

  const config = await SystemConfig.findOneAndUpdate(
    { key: "notification_system" },
    { $set: updates },
    { new: true, upsert: true },
  );

  return NextResponse.json({ success: true, config });
});
