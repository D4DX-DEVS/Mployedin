"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { safeCallbackPath, withCallback } from "@/lib/routing/callbackUrl";
import { logoutCleanup } from "@/lib/consent/logoutCleanup";
import { resetSignOutInProgress } from "@/lib/consent/deviceStorage";
import { CodePasswordField, LinkPasswordStep, linkPasswordErrorKey } from "@/components/features/auth/LinkPasswordStep";
import { SuccessCTA } from "./_components/SuccessCTA";
import { VerifyFailed } from "./_components/VerifyFailed";

// "password": the link needs the account's password (lib/auth/passwordHolder.ts).
type Status = "idle" | "verifying" | "success" | "error" | "no-token" | "password";

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;
  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  return `${visibleLocal}${"•".repeat(Math.max(3, localPart.length - visibleLocal.length))}@${domain}`;
}


export default function VerifyEmailPage() {
  const t = useTranslations("verifyEmail");
  const tp = useTranslations("linkPassword");
  const searchParams = useSearchParams();
  const { locale } = useParams<{ locale: string }>();
  const { status: sessionStatus, update: updateSession } = useSession();
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email");
  const emailFailed = searchParams.get("emailFailed") === "1";
  const registrationRole = searchParams.get("role");
  const callback = safeCallbackPath(searchParams.get("callbackUrl"), locale);
  const changeEmailHref =
    registrationRole === "employer"
      ? `/${locale ?? "en"}/employer-register`
      : registrationRole === "agent"
        ? `/${locale ?? "en"}/agent-register`
        : `/${locale ?? "en"}/register`;

  const [status, setStatus] = useState<Status>(token ? "verifying" : "no-token");
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resendOk, setResendOk] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(emailParam ? 30 : 0);
  const [otp, setOtp] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkPasswordBusy, setLinkPasswordBusy] = useState(false);
  const [linkPasswordError, setLinkPasswordError] = useState("");
  // Not signed in as this account: the code needs its password too. Shown up
  // front with no session; after a refusal when another account is signed in.
  const [codePassword, setCodePassword] = useState("");
  const [codeNeedsPassword, setCodeNeedsPassword] = useState(false);
  const showCodePassword = sessionStatus === "unauthenticated" || codeNeedsPassword;

  // Guard token verification to run exactly once per token (ref persists across
  // updateSession re-renders that would otherwise cause the effect to re-fire)
  const tokenVerifiedRef = useRef<string | null>(null);

  // The JWT still says "unverified" after a successful verify, and the proxy
  // keeps sending that session back here until it is refreshed. next-auth's
  // update() is a silent no-op while the session is loading — and a link is
  // verified on mount, before it has loaded — so the refresh used to be skipped
  // and the user was stuck on this page. Refresh once the session is known; a
  // signed-out visitor (verifying on another device) has nothing to refresh.
  const [sessionStale, setSessionStale] = useState(false);
  // "Back to sign in" is clearing the device and ending the session.
  const [signingOut, setSigningOut] = useState(false);
  const refreshStartedRef = useRef(false);
  useEffect(() => {
    if (!sessionStale || refreshStartedRef.current || sessionStatus === "loading") return;
    if (sessionStatus === "unauthenticated") {
      setSessionStale(false);
      return;
    }
    refreshStartedRef.current = true;
    void updateSession({ isEmailVerified: true }).finally(() => setSessionStale(false));
  }, [sessionStale, sessionStatus, updateSession]);

  // Verified somewhere else — the link opened on a phone, or in another
  // browser — while this signed-in tab waits here. Nothing told this tab, so
  // it stayed on "check your email" until a sign-out. When the tab comes back
  // into view, ask again: update() re-reads isEmailVerified from the database
  // and never trusts the value sent, so this cannot verify anyone by itself.
  useEffect(() => {
    if (status !== "no-token" || sessionStatus !== "authenticated") return;
    let checking = false;
    const recheck = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const next = await updateSession({ isEmailVerified: true });
        if ((next?.user as { isEmailVerified?: boolean } | undefined)?.isEmailVerified) {
          setStatus("success");
        }
      } finally {
        checking = false;
      }
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [status, sessionStatus, updateSession]);

  const handleResend = useCallback(async () => {
    if (!emailParam || resending || resendCooldown > 0) return;
    setResending(true);
    setResendMsg("");
    setResendOk(false);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendMsg(t("resendSuccess"));
        setResendOk(true);
        setResendCooldown(60);
      } else {
        setResendMsg(data.error ?? t("resendFailure"));
      }
    } catch {
      setResendMsg(t("networkError"));
    } finally {
      setResending(false);
    }
  }, [emailParam, resending, resendCooldown, t]);

  // An account an admin or super-agent creates is sent here by the proxy with no
  // code ever issued, while this page says one was sent. Ask for one on arrival;
  // the server keeps any live code, so a fresh registration's is not replaced.
  const arrivalSendRef = useRef(false);
  useEffect(() => {
    if (token || !emailParam || arrivalSendRef.current) return;
    arrivalSendRef.current = true;
    fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailParam, ifMissing: true }),
    })
      .then(async (res) => {
        if (res.ok) return;
        const data = await res.json().catch(() => ({}));
        setResendMsg(data.error ?? t("resendFailure"));
        setResendCooldown(0);
      })
      .catch(() => {
        setResendMsg(t("networkError"));
        setResendCooldown(0);
      });
  }, [token, emailParam, t]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmitOtp = useCallback(async () => {
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      setOtpError(t("otpEmptyError"));
      return;
    }
    if (!emailParam) {
      setOtpError(t("otpNoEmailError"));
      return;
    }
    setVerifyingOtp(true);
    setOtpError("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code, email: emailParam, ...(codePassword ? { password: codePassword } : {}) }),
      });
      const data = await res.json();
      const passwordKey = linkPasswordErrorKey(data.code);
      if (res.ok) {
        setSessionStale(true);
        setStatus("success");
      } else if (passwordKey) {
        setCodeNeedsPassword(true);
        setOtpError(tp(passwordKey));
      } else if (data.code === "CODE_LOCKED") {
        setOtpError(t("codeLocked"));
      } else {
        setOtpError(data.error ?? t("otpInvalidError"));
      }
    } catch {
      setOtpError(t("networkError"));
    } finally {
      setVerifyingOtp(false);
    }
  }, [otp, emailParam, codePassword, t, tp]);

  // The link again, with the password the page asked for.
  const submitLinkPassword = useCallback(async (password: string) => {
    if (!token) return;
    if (!password) {
      setLinkPasswordError(tp("emptyError"));
      return;
    }
    setLinkPasswordBusy(true);
    setLinkPasswordError("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      const passwordKey = linkPasswordErrorKey(data.code);
      if (res.ok) {
        setSessionStale(true);
        setStatus("success");
      } else if (passwordKey) {
        setLinkPasswordError(tp(passwordKey));
      } else if (emailParam) {
        // Expired or used in the meantime: same way out as a failed link.
        setLinkError(data.error ?? t("linkErrorFallback"));
        setStatus("no-token");
      } else {
        setStatus("error");
        setMessage(data.error ?? t("verificationFailedFallback"));
      }
    } catch {
      setLinkPasswordError(t("networkError"));
    } finally {
      setLinkPasswordBusy(false);
    }
  }, [token, emailParam, t, tp]);

  useEffect(() => {
    if (!token) return;

    // Guard: only verify this token once, even if updateSession causes re-renders
    if (tokenVerifiedRef.current === token) return;
    tokenVerifiedRef.current = token;

    const verify = async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok) {
          setSessionStale(true);
          setStatus("success");
        } else if (data.code === "PASSWORD_REQUIRED") {
          // Opened where the account is not signed in: ask for its password.
          setStatus("password");
        } else {
          // Link failed (expired/already used). If we know the email — link
          // URLs carry &email= — drop the user into the code-entry view so they
          // can still verify via OTP or resend, rather than hitting a dead-end
          // error screen with no recovery path.
          if (emailParam) {
            setLinkError(data.error ?? t("linkErrorFallback"));
            setStatus("no-token");
          } else {
            setStatus("error");
            setMessage(data.error ?? t("verificationFailedFallback"));
          }
        }
      } catch {
        setStatus("error");
        setMessage(t("networkError"));
      }
    };

    verify();
  }, [token, emailParam, t]);

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
          <span className="font-bold text-base">M</span>
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">mployedin</span>
      </div>

      {/* Verifying */}
      {status === "verifying" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t("verifyingTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">{t("pleaseWait")}</p>
          </div>
        </div>
      )}

      {status === "password" && (
        <LinkPasswordStep
          purpose="verify"
          locale={locale ?? "en"}
          email={emailParam ?? undefined}
          busy={linkPasswordBusy}
          error={linkPasswordError}
          onSubmit={(password) => void submitLinkPassword(password)}
        />
      )}

      {/* Success */}
      {status === "success" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-green-600" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t("verifiedTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">
              {t("verifiedBody")}
            </p>
          </div>
          <SuccessCTA callback={callback} locale={locale ?? "en"} pending={sessionStale} />
        </div>
      )}

      {/* Error */}

      {status === "error" && <VerifyFailed message={message} locale={locale} callback={callback} />}

      {/* No token — waiting for email */}
      {status === "no-token" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t("checkEmailTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">
              {t("sentCodeToPrefix")}{" "}
              {emailParam ? (
                <span className="font-medium text-foreground">{maskEmail(emailParam)}</span>
              ) : (
                t("yourEmailAddress")
              )}
              {t("sentCodeSuffix")}
            </p>
          </div>

          {linkError && (
            <div role="alert" className="w-full max-w-xs rounded-xl bg-destructive/10 border border-destructive/30 text-left chip-pad">
              <p className="text-xs text-destructive">{linkError}</p>
            </div>
          )}

          {emailFailed && (
            <div className="w-full max-w-xs rounded-xl bg-amber-50 border border-amber-200 text-left chip-pad">
              <p className="text-xs text-amber-800">
                {t("troubleSendingBefore")} <strong>{t("resendWord")}</strong>{t("troubleSendingAfter")}
              </p>
            </div>
          )}

          {/* OTP entry — primary in-app verification path */}
          <div className="w-full max-w-xs space-y-3">
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                name="verification-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder={t("otpPlaceholder")}
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setOtpError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSubmitOtp();
                  }
                }}
                disabled={verifyingOtp}
                aria-label={t("verificationCodeAria")}
                aria-describedby="verification-code-help"
                className="h-12 pl-9 text-center text-lg tracking-[0.5em] font-semibold"
              />
            </div>
            {showCodePassword && (
              <CodePasswordField
                email={emailParam ?? undefined}
                value={codePassword}
                disabled={verifyingOtp}
                onChange={(value) => {
                  setCodePassword(value);
                  setOtpError("");
                }}
              />
            )}
            {otpError && (
              <p role="alert" className="text-sm text-destructive text-center">{otpError}</p>
            )}
            <Button size="lg"
              className="w-full"
              onClick={() => void handleSubmitOtp()}
              disabled={verifyingOtp || otp.length !== 6}
            >
              {verifyingOtp ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("verifyingEllipsis")}</>
              ) : (
                t("verifyCode")
              )}
            </Button>
          </div>

          <div id="verification-code-help" className="w-full max-w-xs rounded-xl bg-muted/50 border text-left space-y-2 card-pad">
            <p className="text-sm font-medium text-foreground">{t("didntReceive")}</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>{t("checkSpamFolder")}</li>
              <li>{t("correctEmailUsed")}</li>
              <li>{t("allowFewMinutes")}</li>
              <li>{t("codeExpiry")}</li>
            </ul>
          </div>
          {resendMsg && (
            <p role="status" className={`text-sm ${resendOk ? "text-green-600" : "text-destructive"}`}>
              {resendMsg}
            </p>
          )}
          {emailParam && (
            <div className="w-full max-w-xs space-y-2">
              <Button size="lg"
                variant="default"
                className="w-full"
                onClick={handleResend}
                disabled={resending || resendCooldown > 0}
              >
                {resending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("sendingEllipsis")}</>
                ) : resendCooldown > 0 ? (
                  t("resendIn", { seconds: resendCooldown })
                ) : (
                  <><RefreshCw className="mr-2 h-4 w-4" />{t("resendVerificationEmail")}</>
                )}
              </Button>
              <Button size="lg" asChild variant="ghost" className="w-full">
                <Link href={changeEmailHref}>{t("changeEmail")}</Link>
              </Button>
            </div>
          )}
          <Button size="lg"
            variant="outline"
            className="w-full max-w-xs"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await logoutCleanup();
                await signOut({ callbackUrl: withCallback(`/${locale ?? "en"}/login`, callback) });
              } catch {
                resetSignOutInProgress();
                setSigningOut(false);
              }
            }}
          >
            {t("backToSignIn")}
          </Button>
          <Button asChild variant="link" className="min-h-11">
            <Link href={`/${locale ?? "en"}/contact`}>{t("contactSupport")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
