"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enableServiceWorker } from "@/lib/pwa/enableServiceWorker";

/** How long to wait for a freshly registered worker to take over before giving up. */
const WORKER_READY_TIMEOUT_MS = 10_000;

/** Settles with `promise`, or rejects once `ms` pass. The timer never outlives the race. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * "Enable push notifications" button. Renders nothing when:
 * - the browser doesn't support push,
 * - NEXT_PUBLIC_VAPID_PUBLIC_KEY isn't configured,
 * - the user is already subscribed, or permission was denied.
 *
 * No service worker is registered until a visitor taps Enable (see
 * lib/pwa/enableServiceWorker.ts), so "no registration" means "not subscribed".
 */
export function EnablePushButton() {
  const t = useTranslations("notificationsPage");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!vapidKey) return;
    // No worker is registered outside production (lib/pwa/enableServiceWorker.ts),
    // so the button could only ever fail.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;
    // Not `.ready`: that never settles while no worker is registered.
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setVisible(!sub))
      .catch(() => {});
  }, [vapidKey]);

  if (!visible) return null;

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }
      // Registers the worker (and records the request) now that the visitor
      // has said yes. Null means it could not be registered; `.ready` would
      // then wait forever.
      if (!(await enableServiceWorker())) throw new Error("service worker unavailable");
      // `.ready` can stay pending (a worker stuck installing); don't leave the
      // button busy forever.
      const reg = await withTimeout(navigator.serviceWorker.ready, WORKER_READY_TIMEOUT_MS);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("pushEnabled"));
      setVisible(false);
    } catch {
      toast.error(t("pushEnableFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void enable()}
      className="flex items-center gap-1.5 text-xs font-medium"
    >
      <BellRing className="h-3.5 w-3.5" />
      {t("enablePush")}
    </Button>
  );
}
