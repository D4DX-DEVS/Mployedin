"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { KeyRound, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/security/csrf-client";

const DISMISS_KEY_PREFIX = "mployedin:temp-password-notice-dismissed:";

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Shown after sign-in to someone still using a password another person issued
 * them (an agent converting a lead hands the new employer a shareable password).
 * An offer, not a gate: they can email themselves a link to set their own, or
 * dismiss it. Setting any new password clears the flag server-side.
 */
export function TemporaryPasswordNotice() {
  const t = useTranslations("temporaryPasswordNotice");
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  const dismissKey = userId ? `${DISMISS_KEY_PREFIX}${userId}` : null;

  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"sent" | "error" | null>(null);

  useEffect(() => {
    if (!dismissKey || readDismissed(dismissKey)) return;
    let active = true;
    fetch("/api/user/password-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { temporaryPassword?: boolean } | null) => {
        if (active && data?.temporaryPassword) setVisible(true);
      })
      .catch(() => {/* the notice is optional — never block the dashboard */});
    return () => {
      active = false;
    };
  }, [dismissKey]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    if (!dismissKey) return;
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      /* private mode: it simply shows again next visit */
    }
  };

  const sendLink = async () => {
    if (!email) return;
    setSending(true);
    try {
      const res = await csrfFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResult(res.ok ? "sent" : "error");
    } catch {
      setResult("error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 sm:px-4 lg:px-6">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm text-amber-900">
          <p>{result === "sent" ? t("linkSent") : t("message")}</p>
          {result === "error" && <p className="mt-1 text-rose-700">{t("linkError")}</p>}
          {result !== "sent" && (
            <Button
              size="sm"
              variant="outline"
              onClick={sendLink}
              disabled={sending || !email}
              className="mt-2 h-8 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            >
              {sending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {t("sendLink")}
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dismiss")}
          className="tap-target-box rounded-md p-1 text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
