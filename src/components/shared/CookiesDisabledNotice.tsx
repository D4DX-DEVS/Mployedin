"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { cn } from "@/lib/utils";

// The setting cannot change without the visitor reloading (the notice says so),
// so there is nothing to subscribe to.
const subscribe = () => () => {};
// Only an explicit false counts: a browser that does not report it is assumed fine.
const getSnapshot = () => typeof navigator === "undefined" || navigator.cookieEnabled !== false;
// The server cannot know. Answering "on" keeps the server render silent, so
// hydration matches and the notice appears only after the browser has spoken.
const getServerSnapshot = () => true;

/** Whether the browser lets this site set cookies. Server and first client render: true. */
export function useCookiesEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface CookiesDisabledNoticeProps {
  className?: string;
}

/**
 * Sign-in and sign-up both end in a session cookie. With cookies blocked the
 * form looks fine and then fails with nothing to explain it, so the page says
 * what is wrong above the form. It informs and never blocks the form.
 */
export function CookiesDisabledNotice({ className }: CookiesDisabledNoticeProps) {
  const t = useTranslations("auth");
  const enabled = useCookiesEnabled();
  if (enabled) return null;

  return (
    <div
      role="alert"
      className={cn("flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950", className)}
    >
      <Cookie className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{t("cookiesDisabledNotice")}</p>
    </div>
  );
}
