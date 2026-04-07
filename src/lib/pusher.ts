import Pusher from "pusher";

// Server-side Pusher singleton
let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher {
  if (!pusherInstance) {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER ?? "ap2";

    if (!appId || !key || !secret) {
      throw new Error("Pusher server credentials not configured (PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET)");
    }

    pusherInstance = new Pusher({ appId, key, secret, cluster, useTLS: true });
  }
  return pusherInstance;
}

/** Trigger a new DM event on the recipient's private channel */
export async function triggerDMEvent(
  recipientUserId: string,
  event: string,
  data: Record<string, unknown>
) {
  try {
    const pusher = getPusher();
    await pusher.trigger(`private-dm-${recipientUserId}`, event, data);
  } catch (err) {
    // Don't throw — message was already saved, real-time is best-effort
    console.error("[Pusher] trigger failed:", err);
  }
}
