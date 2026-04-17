import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import NotificationPreference, {
  getOrCreatePreferences,
} from "@/models/NotificationPreference";

/**
 * GET /api/user/notification-preferences
 * Returns the current user's notification preferences.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  await connectDB();
  const prefs = await getOrCreatePreferences(ctx.userId);
  return NextResponse.json({ success: true, data: prefs });
});

/**
 * PATCH /api/user/notification-preferences
 * Updates notification preferences. Accepts partial updates.
 *
 * Body: {
 *   emailFrequency?: "instant" | "daily" | "weekly" | "none",
 *   categories?: { [key]: { enabled: boolean, channels: string[] } },
 *   unsubscribedAll?: boolean,
 *   dailyDigestTime?: string,
 *   timezone?: string,
 * }
 */
export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();

  const body = await req.json();

  // Validate emailFrequency
  const validFrequencies = ["instant", "daily", "weekly", "none"];
  if (body.emailFrequency && !validFrequencies.includes(body.emailFrequency)) {
    return NextResponse.json(
      { error: "Invalid emailFrequency" },
      { status: 400 },
    );
  }

  // Validate channels
  const validChannels = ["in_app", "email", "whatsapp"];
  if (body.categories) {
    for (const [key, val] of Object.entries(body.categories)) {
      const catVal = val as { channels?: string[] };
      if (catVal.channels) {
        const invalid = catVal.channels.filter(
          (c: string) => !validChannels.includes(c),
        );
        if (invalid.length > 0) {
          return NextResponse.json(
            { error: `Invalid channels in ${key}: ${invalid.join(", ")}` },
            { status: 400 },
          );
        }
      }
    }
  }

  // Build $set object for partial updates
  const updateOps: Record<string, unknown> = {};

  if (body.emailFrequency) updateOps.emailFrequency = body.emailFrequency;
  if (typeof body.unsubscribedAll === "boolean")
    updateOps.unsubscribedAll = body.unsubscribedAll;
  if (body.dailyDigestTime) updateOps.dailyDigestTime = body.dailyDigestTime;
  if (body.timezone) updateOps.timezone = body.timezone;

  // Flatten category updates for $set
  if (body.categories) {
    for (const [catKey, catVal] of Object.entries(body.categories)) {
      const cat = catVal as { enabled?: boolean; channels?: string[] };
      if (typeof cat.enabled === "boolean") {
        updateOps[`categories.${catKey}.enabled`] = cat.enabled;
      }
      if (cat.channels) {
        updateOps[`categories.${catKey}.channels`] = cat.channels;
      }
    }
  }

  if (Object.keys(updateOps).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const prefs = await NotificationPreference.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: updateOps },
    { new: true, upsert: true },
  );

  return NextResponse.json({ success: true, data: prefs });
});
