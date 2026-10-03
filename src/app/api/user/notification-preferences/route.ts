import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import NotificationPreference, {
  getOrCreatePreferences,
} from "@/models/NotificationPreference";
import { validateBody } from "@/lib/validators";
import { notificationPreferencesUpdateSchema } from "@/lib/validators/settings";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { resolveDefaultDigestCadence } from "@/models/SystemConfig";
import { hasWhatsAppChannel, isWhatsAppReachable, recordWhatsAppOptInChange, type WhatsAppReachAccount } from "@/lib/communications/whatsapp/optIn";
import { toWaRecipient } from "@/lib/communications/whatsapp/phone";
import { ensureStartCode, getWhatsAppStartLink } from "@/lib/communications/whatsapp/startLink";
import logger from "@/lib/logger";
import User from "@/models/User";

/**
 * Whose preferences a request reads and writes: always the signed-in person's
 * own. A company member's `ctx.userId` is the owner's id (withAuth swaps it so
 * employer lookups resolve the company); their own id is `member.actorId`.
 * Tenant view never reaches this route (skipTenantView below): staff browsing an
 * employer's workspace act on their own preferences, so they can neither change
 * the employer's nor write consent rows in its name. The consent rows written
 * below therefore carry the acting person as `userId`.
 */
function ownUserId(ctx: AuthContext): string {
  return ctx.member?.actorId ?? ctx.userId;
}

/**
 * Whether WhatsApp messages can reach this person: only once a START from the
 * number on their profile has verified it (verification.ts), and only while no
 * STOP stands since, on the account or on the number's list (the same rule and
 * list read the sends use, isWhatsAppReachable). After a STOP the page therefore
 * shows the START instructions again, not "Verified". The page shows the number
 * masked, so only its last 4 digits leave the server; `phoneLast4` is null when
 * the profile has no phone. `phoneValid` is false when the phone cannot be read
 * as an international number (no country code): nothing can be sent to it or
 * verified.
 *
 * A START verifies an account only when it carries the account's personal code
 * (startCode.ts) and comes from the profile phone. So an account that still has
 * to send one (not verified, valid phone) gets `startCode`, its own code,
 * created here on first need, and `waLink`, which opens WhatsApp with
 * `START <code>` typed to the business number. Any other account gets neither,
 * and no code is created for it. `waLink` is also null in mock mode, when Meta
 * cannot be reached, or when no code could be made (startLink.ts never throws);
 * the code is still returned in the first two cases, for the page to show.
 */
async function whatsappVerificationFor(
  userId: string,
): Promise<{ verified: boolean; waLink: string | null; phoneLast4: string | null; phoneValid: boolean; startCode: string | null }> {
  const user = (await User.findById(userId)
    .select("phone whatsapp.verifiedNumber whatsapp.optInAt whatsapp.optOutAt whatsapp.startCode")
    .lean()) as (WhatsAppReachAccount & { whatsapp?: { startCode?: string | null } | null }) | null;
  const digits = (user?.phone ?? "").replace(/\D/g, "");
  let verified = false;
  try {
    verified = await isWhatsAppReachable(user);
  } catch (err) {
    // An unreadable STOP list refuses sends (send.ts), so it cannot be "Verified" either; the page still loads.
    logger.warn({ errorName: err instanceof Error ? err.name : typeof err }, "[whatsapp] preferences: STOP list unreadable, reported as not verified");
  }
  const phoneValid = toWaRecipient(user?.phone) !== null;
  // `userId` is always the signed-in person's own id (ownUserId), so the code is theirs alone.
  const startCode = user && !verified && phoneValid ? (user.whatsapp?.startCode ?? (await ensureStartCode(userId))) : null;
  return {
    verified,
    waLink: startCode ? await getWhatsAppStartLink(startCode) : null,
    phoneLast4: digits ? digits.slice(-4) : null,
    phoneValid,
    startCode,
  };
}

/**
 * GET /api/user/notification-preferences
 * Returns the current user's notification preferences, and their WhatsApp
 * verification state as `whatsappVerification`.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  await connectDB();
  const userId = ownUserId(ctx);
  const [prefs, whatsappVerification] = await Promise.all([getOrCreatePreferences(userId), whatsappVerificationFor(userId)]);

  // `emailFrequency` is stored only once the user picks one, so a settings page
  // reading it raw would render an unselected radio group for everybody who
  // never has. Report the cadence that would actually be used — the admin's
  // platform default — so the control shows the truth rather than a guess.
  // A PATCH then writes the choice and this stops applying to them.
  const data = prefs.toObject();
  if (!data.emailFrequency) {
    data.emailFrequency = await resolveDefaultDigestCadence();
  }

  return NextResponse.json({ success: true, data, whatsappVerification });
}, { skipTenantView: true });

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
  const userId = ownUserId(ctx);

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

  // The pre-image serves two readers: the stale-snapshot guard (updatedAt) and
  // the WhatsApp opt-in record (categories). A save that carries neither a
  // category change nor a stamp needs neither, so it skips the read.
  const expectedUpdatedAt = body.expectedUpdatedAt ? new Date(body.expectedUpdatedAt) : null;
  const beforeDoc =
    body.categories || expectedUpdatedAt
      ? ((await NotificationPreference.findOne({ userId }).select("categories updatedAt").lean()) as
          | { categories?: Record<string, { channels?: string[] }>; updatedAt?: Date }
          | null)
      : null;

  // A page sends its whole snapshot. If the stored copy moved on since the page
  // loaded it (a STOP reply on WhatsApp, a save from another tab), writing the
  // snapshot back would undo that: a stale `whatsapp` channel would be re-added.
  // Refuse, and let the page reload.
  const stale = () => NextResponse.json({ success: false, error: "stale_preferences" }, { status: 409 });
  if (expectedUpdatedAt && beforeDoc?.updatedAt && new Date(beforeDoc.updatedAt) > expectedUpdatedAt) return stale();

  // The same condition again, inside the write, so a change landing between the
  // read above and the update below cannot slip through. A filter that can miss
  // an existing document must not upsert (the unique userId index would throw),
  // which is why the guard only applies when a stored stamp was seen.
  const guarded = Boolean(expectedUpdatedAt && beforeDoc?.updatedAt);
  const prefs = await NotificationPreference.findOneAndUpdate(
    guarded ? { userId, updatedAt: { $lte: expectedUpdatedAt } } : { userId },
    { $set: updateOps },
    { returnDocument: "after", upsert: !guarded },
  );
  if (!prefs) return stale();

  // The WhatsApp channel is a preference: turning it on clears no STOP and
  // stamps no opt-in (a START from the number does, webhookHandlers.ts). Turning
  // the last one off is recorded as a withdrawal, and turning it back on as a
  // grant only when the START-verified number can be reached again. optIn.ts
  // applies these rules.
  if (body.categories) {
    const afterCategories = (prefs.toObject ? prefs.toObject() : prefs)?.categories as Record<string, { channels?: string[] }> | undefined;
    await recordWhatsAppOptInChange({
      userId,
      before: hasWhatsAppChannel(beforeDoc?.categories),
      after: hasWhatsAppChannel(afterCategories),
      source: "notification_settings",
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    });
  }

  await logActivity({
    // The member's own act, not one done on the owner's behalf.
    ...actorFromCtx({ userId, role: ctx.role }),
    action: "notification_preferences.update",
    resource: "notification_preferences",
    changes: { after: updateOps },
    req,
  });

  return NextResponse.json({ success: true, data: prefs });
}, { skipTenantView: true });
