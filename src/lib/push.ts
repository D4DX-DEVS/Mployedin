import webpush from "web-push";
import PushSubscription from "@/models/PushSubscription";
import logger from "@/lib/logger";

/**
 * Web Push sender. No-ops unless VAPID keys are configured:
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (generate: npx web-push generate-vapid-keys)
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY must mirror VAPID_PUBLIC_KEY for the client.
 */

let vapidConfigured = false;

export function isPushEnabled(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureVapid(): boolean {
  if (!isPushEnabled()) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_CONTACT_EMAIL ?? "support@mployedin.com"}`,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    vapidConfigured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  link?: string;
}

/** Send a push to every subscription the user has. Dead endpoints are pruned. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;

  const subs = await PushSubscription.find({ userId }).lean() as {
    _id: unknown; endpoint: string; keys: { p256dh: string; auth: string };
  }[];
  if (!subs.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 404/410 = subscription expired or revoked — prune it.
        if (statusCode === 404 || statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          logger.error({ err, userId }, "web-push send failed");
        }
      }
    })
  );
}
