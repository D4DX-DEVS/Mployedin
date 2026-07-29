import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import NotificationPreference, {
  getOrCreatePreferences,
} from "@/models/NotificationPreference";
import { validateBody } from "@/lib/validators";
import { notificationPreferencesUpdateSchema } from "@/lib/validators/settings";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

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

  const body = await validateBody(req, notificationPreferencesUpdateSchema);

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
    { returnDocument: "after", upsert: true },
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "notification_preferences.update",
    resource: "notification_preferences",
    changes: { after: updateOps },
    req,
  });

  return NextResponse.json({ success: true, data: prefs });
});
