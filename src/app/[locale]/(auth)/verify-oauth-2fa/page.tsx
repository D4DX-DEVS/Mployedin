"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut, getSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";

const ROLE_REDIRECTS: Record<string, string> = {
  admin: "admin",
  employer: "employer",
  job_seeker: "job-seeker",
  agent: "agent",
  super_agent: "super-agent",
};

/**
 * /verify-oauth-2fa
 *
 * Renders ONLY when the user signs in via OAuth (Google/LinkedIn/Apple) and
 * their account has TOTP 2FA enrolled (admin / super_agent). In that case
 * lib/auth/config.ts issues a PARTIAL session (token.pending2fa=true,
 * session.user.id="") and middleware redirects here. The user enters their
 * TOTP code; we POST it to /api/auth/oauth-2fa/verify, which validates it and
 * re-encodes the JWT as a fully-authenticated session.
 */
export default function VerifyOAuth2faPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const t = useTranslations("auth");

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // If we somehow land here without a pending-2FA session (e.g. user navigated
  // here directly, or already verified), redirect to the appropriate dashboard
  // or back to login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (cancelled) return;
      const pending = (session?.user as unknown as { pending2fa?: boolean } | undefined)?.pending2fa;
      if (!pending) {
        // Either fully signed-in (redirect to dashboard) or signed-out (login).
        const role = (session?.user as unknown as { role?: string } | undefined)?.role;
        const isOnboarded = (session?.user as unknown as { isOnboarded?: boolean } | undefined)?.isOnboarded;
        const dest =
          role === "job_seeker" && isOnboarded === false
            ? `/${locale}/onboarding`
            : role
              ? `/${locale}/${ROLE_REDIRECTS[role] ?? "job-seeker"}`
              : `/${locale}/login`;
        router.replace(dest);
      }
    })();
    return () => { cancelled = true; };
  }, [locale, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    const trimmed = code.trim();
    if (!trimmed) {
      setError(t("oauth2faInvalid"));
      return;
    }

    setLoading(true);
    try {
      // CSRF token must be sent as x-csrf-token (double-submit cookie pattern).
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf-token="))
        ?.split("=")[1] ?? "";

      const res = await fetch("/api/auth/oauth-2fa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "same-origin",
        body: JSON.stringify({ code: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setError(t("oauth2faTooManyAttempts"));
        return;
      }
      if (!res.ok) {
        if (data?.code === "2fa_invalid") {
          setError(t("oauth2faInvalid"));
        } else {
          setError(data?.error || t("oauth2faGenericError"));
        }
        // Refresh session state — if the partial session was invalidated
        // (e.g. user disabled 2FA elsewhere), send to login.
        const session = await getSession();
        const stillPending = (session?.user as unknown as { pending2fa?: boolean } | undefined)?.pending2fa;
        if (!stillPending) {
          router.replace(`/${locale}/login`);
        }
        return;
      }

      // Success — recovery code may have been consumed.
      if (data?.recoveryCodeConsumed) {
        setInfo(t("oauth2faRecoveryUsed"));
      }

      // Force a fresh session fetch on the client so next-auth/react sees the
      // updated cookie, then route to the user's dashboard.
      const session = await getSession();
      const role = (session?.user as unknown as { role?: string } | undefined)?.role;
      const isOnboarded = (session?.user as unknown as { isOnboarded?: boolean } | undefined)?.isOnboarded;
      const dest =
        role === "job_seeker" && isOnboarded === false
          ? `/${locale}/onboarding`
          : role
            ? `/${locale}/${ROLE_REDIRECTS[role] ?? "job-seeker"}`
            : `/${locale}/login`;
      router.replace(dest);
    } catch {
      setError(t("oauth2faGenericError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace(`/${locale}/login`);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ShieldCheck className="h-7 w-7" />
      </div>

      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("oauth2faTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("oauth2faSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="field">
          <Label htmlFor="oauth-2fa-code" className="text-sm font-medium">
            {t("twoFactorCode")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("twoFactorPrompt")}</p>
          <Input
            id="oauth-2fa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
            className="h-12 rounded-xl border-border/70 bg-background/70 px-4 text-center text-lg tracking-[0.4em] transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="text-sm text-muted-foreground" role="status">
            {info}
          </p>
        )}

        <Button size="lg"
          type="submit"
          disabled={loading || code.trim().length < 6}
          className="w-full rounded-xl text-base font-medium"
        >
          {loading ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t("oauth2faVerifying")}
            </>
          ) : (
            t("oauth2faVerify")
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={handleSignOut}
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t("oauth2faSignOut")}
      </button>
    </div>
  );
}
