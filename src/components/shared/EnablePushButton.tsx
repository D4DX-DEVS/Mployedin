"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * "Enable push notifications" button. Renders nothing when:
 * - the browser doesn't support push,
 * - NEXT_PUBLIC_VAPID_PUBLIC_KEY isn't configured,
 * - the user is already subscribed, or permission was denied.
 */
export function EnablePushButton() {
  const t = useTranslations("notificationsPage");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!vapidKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
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
      const reg = await navigator.serviceWorker.ready;
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
