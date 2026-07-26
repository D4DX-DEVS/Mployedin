"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";

type Status = "idle" | "verifying" | "success" | "error" | "no-token";

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;
  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  return `${visibleLocal}${"•".repeat(Math.max(3, localPart.length - visibleLocal.length))}@${domain}`;
}

export default function VerifyEmailPage() {
  const t = useTranslations("verifyEmail");
  const searchParams = useSearchParams();
  const { locale } = useParams<{ locale: string }>();
  const { update: updateSession } = useSession();
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email");
  const emailFailed = searchParams.get("emailFailed") === "1";
  const registrationRole = searchParams.get("role");
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
        body: JSON.stringify({ otp: code, email: emailParam }),
      });
      const data = await res.json();
      if (res.ok) {
        // Refresh the JWT in case the user already holds a session (e.g. they
        // logged into an unverified account before completing verification) —
        // without this the session stays stuck on isEmailVerified:false until
        // next login, and middleware keeps bouncing them back to this page.
        await updateSession({ isEmailVerified: true });
        setStatus("success");
      } else {
        setOtpError(data.error ?? t("otpInvalidError"));
      }
    } catch {
      setOtpError(t("networkError"));
    } finally {
      setVerifyingOtp(false);
    }
  }, [otp, emailParam, updateSession, t]);

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok) {
          await updateSession({ isEmailVerified: true });
          setStatus("success");
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
  }, [token, emailParam, updateSession, t]);

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

      {/* Success */}
      {status === "success" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t("verifiedTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">
              {t("verifiedBody")}
            </p>
          </div>
          <Button asChild className="w-full max-w-xs h-11">
            <Link href={`/${locale ?? "en"}/login`}>{t("continueToSignIn")}</Link>
          </Button>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t("verificationFailedTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">
              {message || t("linkUsedError")}
            </p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <Button asChild variant="outline" className="w-full h-11">
              <Link href={`/${locale ?? "en"}/login`}>{t("backToSignIn")}</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("needHelp")}{" "}
              <Link href={`/${locale ?? "en"}/contact`} className="text-primary hover:underline">
                {t("contactSupport")}
              </Link>
            </p>
          </div>
        </div>
      )}

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
            <div role="alert" className="w-full max-w-xs p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-left">
              <p className="text-xs text-destructive">{linkError}</p>
            </div>
          )}

          {emailFailed && (
            <div className="w-full max-w-xs p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-left">
              <p className="text-xs text-amber-800 dark:text-amber-300">
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
            {otpError && (
              <p role="alert" className="text-sm text-destructive text-center">{otpError}</p>
            )}
            <Button
              className="w-full h-11"
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

          <div id="verification-code-help" className="w-full max-w-xs p-4 rounded-xl bg-muted/50 border text-left space-y-2">
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
              <Button
                variant="default"
                className="w-full h-11"
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
              <Button asChild variant="ghost" className="w-full h-11">
                <Link href={changeEmailHref}>{t("changeEmail")}</Link>
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full max-w-xs h-11"
            onClick={() => signOut({ callbackUrl: `/${locale ?? "en"}/login` })}
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
