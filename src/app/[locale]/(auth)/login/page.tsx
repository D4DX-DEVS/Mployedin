"use client";

import { useState, useEffect, useRef } from "react";
import { signIn, getSession } from "next-auth/react";
import { signInWithPopup } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

const REMEMBER_ME_KEY = "mployedin_remember_email";
const ROLE_REDIRECTS: Record<string, string> = {
  admin: "admin",
  employer: "employer",
  job_seeker: "job-seeker",
  agent: "agent",
  super_agent: "super-agent",
};

type LoginErrorKind =
  | "credentials"
  | "two-factor"
  | "locked"
  | "rate-limit"
  | "service"
  | "session"
  | "oauth";

interface LoginErrorState {
  kind: LoginErrorKind;
  message: string;
}

function getPostSignInPath(locale: string, role: string, isOnboarded: boolean): string {
  if (role === "job_seeker" && !isOnboarded) {
    return `/${locale}/onboarding`;
  }
  return `/${locale}/${ROLE_REDIRECTS[role] ?? "job-seeker"}`;
}

function getSafeCallbackPath(locale: string): string | null {
  const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
  if (!callbackUrl) return null;

  try {
    const parsed = new URL(callbackUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    if (!parsed.pathname.startsWith(`/${locale}/`)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function getOAuthRedirectUrl(locale: string): string {
  const callbackPath = getSafeCallbackPath(locale);
  return callbackPath
    ? `/api/auth/post-login-redirect?callbackUrl=${encodeURIComponent(callbackPath)}`
    : "/api/auth/post-login-redirect";
}

export default function LoginPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginErrorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [requires2fa, setRequires2fa] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const anyLoading = loading || googleLoading || linkedInLoading || appleLoading;

  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_ME_KEY);
    const params = new URLSearchParams(window.location.search);
    const requestedEmail = params.get("email");
    const initialEmail = requestedEmail || savedEmail;
    if (initialEmail) {
      setEmail(initialEmail);
    }
    if (savedEmail) {
      setRememberMe(true);
    }

    const reason = params.get("reason");
    if (reason === "idle") {
      setError({ kind: "session", message: t("sessionExpiredInactivity") });
    }
    const oauthError = params.get("error");
    if (oauthError === "OAuthAccountNotLinked") {
      setError({ kind: "oauth", message: t("oauthAccountNotLinked") });
    } else if (oauthError) {
      setError({ kind: "oauth", message: t("oauthError") });
    }
  }, [t]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      const idToken = await result.user.getIdToken();

      const res = await signIn("firebase", { idToken, redirect: false });
      if (res?.error) {
        setError({ kind: "oauth", message: t("googleSignInFailed") });
        return;
      }

      const session = await getSession();
      const role = (session?.user as Record<string, unknown>)?.role as string ?? "job_seeker";
      const isOnboarded = (session?.user as Record<string, unknown>)?.isOnboarded as boolean ?? true;
      router.replace(getSafeCallbackPath(locale) ?? getPostSignInPath(locale, role, isOnboarded));
    } catch {
      setError({ kind: "oauth", message: t("googleSignInFailed") });
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
    }

    try {
      const result = await signIn("credentials", {
        email,
        password,
        rememberMe: rememberMe ? "true" : "false",
        ...(totpCode ? { totpCode } : {}),
        redirect: false,
      });

      if (result?.error) {
        const code = (result as { code?: string }).code;
        if (code === "2fa_required") {
          setRequires2fa(true);
          return;
        }
        if (code === "2fa_invalid") {
          setRequires2fa(true);
          setError({ kind: "two-factor", message: t("invalidTwoFactorCode") });
          return;
        }
        if (code === "account_locked") {
          setError({ kind: "locked", message: t("accountLocked") });
          return;
        }
        if (code === "login_rate_limited") {
          setError({ kind: "rate-limit", message: t("loginRateLimited") });
          return;
        }
        if (code === "authentication_unavailable") {
          setError({ kind: "service", message: t("authenticationUnavailable") });
          return;
        }
        if (!code || code === "credentials") {
          setError({ kind: "credentials", message: t("invalidCredentials") });
          return;
        }
        setError({ kind: "service", message: t("authenticationUnavailable") });
        return;
      }

      const session = await getSession();
      const role = (session?.user as Record<string, unknown>)?.role as string ?? "job_seeker";
      const isOnboarded = (session?.user as Record<string, unknown>)?.isOnboarded as boolean ?? true;
      router.replace(getSafeCallbackPath(locale) ?? getPostSignInPath(locale, role, isOnboarded));
    } catch {
      setError({ kind: "service", message: t("somethingWentWrong") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between lg:hidden">
        <Link
          href={`/${locale}`}
          className="inline-flex w-fit items-center"
        >
          <Image src="/logo.png" alt="Mployedin" width={100} height={34} className="h-auto w-[106px] object-contain" style={{ height: "auto" }} priority />
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.08] px-3 py-1.5 text-xs font-medium text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("secureSignIn")}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary lg:flex">
          <LockKeyhole className="h-3.5 w-3.5" />
          {t("secureSignIn")}
        </div>
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] text-foreground sm:text-[2rem]">
          {t("welcomeBack")}
        </h1>
        <p className="max-w-sm text-sm leading-5 text-muted-foreground">
          {t("enterCredentials")}
        </p>
      </div>

      <Button size="lg"
        variant="outline"
        type="button"
        className="w-full rounded-xl border-border bg-card font-semibold shadow-sm transition-all hover:border-primary/30 hover:bg-primary/[0.04]"
        onClick={handleGoogleSignIn}
        disabled={anyLoading}
      >
        {googleLoading ? (
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
        ) : (
          <svg className="me-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335" />
          </svg>
        )}
        {t("continueWithGoogle")}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-3 font-medium text-muted-foreground">{t("orUseEmail")}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="field">
          <Label htmlFor="email" className="text-sm font-medium">{t("emailAddress")}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            className="h-11 rounded-xl border-border/70 bg-background/70 px-4 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">{t("password")}</Label>
            <Link
              href={`/${locale}/forgot-password`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary transition-colors hover:text-primary/80"
            >
              {t("forgotPasswordLink")}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-11 rounded-xl border-border/70 bg-background/70 px-4 pe-11 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 end-0 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {requires2fa && (
          <div className="field rounded-xl border border-primary/20 bg-primary/[0.04] card-pad">
            <Label htmlFor="totp-code" className="text-sm font-medium">{t("twoFactorCode")}</Label>
            <p className="text-xs text-muted-foreground">{t("twoFactorPrompt")}</p>
            <Input
              id="totp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              required
              maxLength={6}
              pattern="[0-9]{6}"
              aria-invalid={error?.kind === "two-factor"}
              aria-describedby={error?.kind === "two-factor" ? "login-error" : undefined}
              className="h-11 rounded-xl border-border/70 bg-background/70 px-4 text-center text-lg tracking-[0.4em] transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
          </div>
        )}

        <div className="flex min-h-11 items-center gap-2">
          <Checkbox
            id="remember-me"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked === true)}
          />
          <Label htmlFor="remember-me" className="text-sm font-normal text-muted-foreground cursor-pointer select-none">
            {t("rememberEmail")}
          </Label>
        </div>

        {error && (
          <div
            ref={errorRef}
            id="login-error"
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium leading-5 text-destructive">{error.message}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {(error.kind === "credentials" || error.kind === "locked" || error.kind === "rate-limit") && (
                    <Link
                      href={`/${locale}/forgot-password`}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-destructive underline underline-offset-4"
                    >
                      {t("resetPasswordAction")}
                    </Link>
                  )}
                  <Link
                    href={`/${locale}/contact`}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-destructive underline underline-offset-4"
                  >
                    {t("getSignInHelp")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        <Button size="lg"
          type="submit"
          className="w-full rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5"
          disabled={anyLoading}
        >
          {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <ArrowRight className="me-2 h-4 w-4" />}
          {t("signIn")}
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <Button size="lg"
          variant="outline"
          type="button"
          className="rounded-xl border-border/70 bg-background/60 text-sm font-medium transition-colors hover:bg-muted/60"
          onClick={() => { setAppleLoading(true); setError(null); signIn("apple", { callbackUrl: getOAuthRedirectUrl(locale) }); }}
          disabled={anyLoading}
        >
          {appleLoading ? (
            <Loader2 className="w-5 h-5 mr-0.5 animate-spin" />
          ) : (
            <svg className="w-5 h-5 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          )}
          Apple
        </Button>
        <Button size="lg"
          variant="outline"
          type="button"
          className="rounded-xl border-border/70 bg-background/60 text-sm font-medium transition-colors hover:bg-muted/60"
          onClick={() => { setLinkedInLoading(true); setError(null); signIn("linkedin", { callbackUrl: getOAuthRedirectUrl(locale) }); }}
          disabled={anyLoading}
        >
          {linkedInLoading ? (
            <Loader2 className="w-5 h-5 mr-0.5 animate-spin" />
          ) : (
            <svg className="w-5 h-5 mr-0.5 fill-[#0A66C2]" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          )}
          LinkedIn
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link
          href={`/${locale}/register`}
          className="inline-flex min-h-11 items-center text-primary font-semibold transition-colors hover:text-primary/80"
        >
          {t("createAccount")}
        </Link>
        {" \u00B7 "}
        <Link
          href={`/${locale}/employer-register`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("postJobsAsEmployer")}
        </Link>
      </p>
    </div>
  );
}
