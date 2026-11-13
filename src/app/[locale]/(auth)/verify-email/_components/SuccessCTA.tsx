"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withCallback } from "@/lib/routing/callbackUrl";
import { postSignInPath } from "@/lib/auth/roleHome";

/**
 * The verified-state CTA. A visitor who is already signed in (the usual case:
 * register signs a job seeker straight in) goes to their dashboard — sending
 * them to /login went nowhere, since the login page bounces a live session.
 */
export function SuccessCTA({ callback, locale, pending }: { callback: string | null; locale: string; pending: boolean }) {
  const { data: session } = useSession();
  const t = useTranslations("verifyEmail");
  const user = session?.user as { role?: string; isOnboarded?: boolean } | undefined;

  const href = user?.role
    ? withCallback(postSignInPath(locale, user.role, user.isOnboarded !== false), callback)
    : withCallback(`/${locale}/login`, callback);

  // Until the session knows the address is verified, the dashboard would bounce
  // straight back here — hold the button for that moment.
  if (pending) {
    return (
      <Button size="lg" disabled aria-busy="true" className="w-full max-w-xs">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("continueToDashboard")}
      </Button>
    );
  }

  // A plain <a>, not <Link>: sign-in navigated to the dashboard and the proxy
  // redirected here, and the client router keeps that redirect for ~5 minutes.
  // A client-side navigation lands straight back on this page without asking
  // the server. Loading the page from the server uses the refreshed session.
  return (
    <Button size="lg" asChild className="w-full max-w-xs">
      <a href={href}>{user?.role ? t("continueToDashboard") : t("continueToSignIn")}</a>
    </Button>
  );
}
