"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";

type Status = "idle" | "verifying" | "success" | "error" | "no-token";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const { locale } = useParams<{ locale: string }>();
  const { update: updateSession } = useSession();
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email");
  const emailFailed = searchParams.get("emailFailed") === "1";

  const [status, setStatus] = useState<Status>(token ? "verifying" : "no-token");
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [otp, setOtp] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");

  const handleResend = useCallback(async () => {
    if (!emailParam || resending) return;
    setResending(true);
    setResendMsg("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendMsg("Verification email sent! Check your inbox.");
      } else {
        setResendMsg(data.error ?? "Failed to resend. Please try again later.");
      }
    } catch {
      setResendMsg("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  }, [emailParam, resending]);

  const handleSubmitOtp = useCallback(async () => {
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      setOtpError("Please enter the 6-digit code.");
      return;
    }
    if (!emailParam) {
      setOtpError("We couldn't tell which account this code belongs to. Please open the link from your verification email instead.");
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
        setOtpError(data.error ?? "Invalid or expired code. Try resending.");
      }
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  }, [otp, emailParam, updateSession]);

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
          setStatus("error");
          setMessage(data.error ?? "Verification failed. The link may have expired.");
        }
      } catch {
        setStatus("error");
        setMessage("Network error. Please try again.");
      }
    };

    verify();
  }, [token, updateSession]);

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
            <h1 className="text-2xl font-semibold tracking-tight">Verifying your email…</h1>
            <p className="text-base text-muted-foreground font-light">Just a moment, please wait.</p>
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
            <h1 className="text-2xl font-semibold tracking-tight">Email verified!</h1>
            <p className="text-base text-muted-foreground font-light">
              Your email address has been confirmed. You can now access your dashboard.
            </p>
          </div>
          <Button asChild className="w-full max-w-xs h-11">
            <Link href={`/${locale ?? "en"}/login`}>Continue to sign in</Link>
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
            <h1 className="text-2xl font-semibold tracking-tight">Verification failed</h1>
            <p className="text-base text-muted-foreground font-light">
              {message || "This link is invalid or has already been used."}
            </p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <Button asChild variant="outline" className="w-full h-11">
              <Link href={`/${locale ?? "en"}/login`}>Back to sign in</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Need help?{" "}
              <Link href={`/${locale ?? "en"}/contact`} className="text-primary hover:underline">
                Contact support
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
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="text-base text-muted-foreground font-light">
              We sent a 6-digit verification code to{" "}
              {emailParam ? (
                <span className="font-medium text-foreground">{emailParam}</span>
              ) : (
                "your email address"
              )}
              . Enter the code below to activate your account — or click the link in the email.
            </p>
          </div>

          {emailFailed && (
            <div className="w-full max-w-xs p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-left">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                We had trouble sending that email. Tap <strong>Resend</strong> below to get your code.
              </p>
            </div>
          )}

          {/* OTP entry — primary in-app verification path */}
          <div className="w-full max-w-xs space-y-3">
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="Enter 6-digit code"
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
                aria-label="Verification code"
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</>
              ) : (
                "Verify code"
              )}
            </Button>
          </div>

          <div className="w-full max-w-xs p-4 rounded-xl bg-muted/50 border text-left space-y-2">
            <p className="text-sm font-medium text-foreground">Didn&apos;t receive it?</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Check your spam or junk folder</li>
              <li>Make sure you used the correct email address</li>
              <li>Allow a few minutes for the email to arrive</li>
            </ul>
          </div>
          {resendMsg && (
            <p className={`text-sm ${resendMsg.includes("sent") ? "text-green-600" : "text-destructive"}`}>
              {resendMsg}
            </p>
          )}
          {emailParam && (
            <Button
              variant="default"
              className="w-full max-w-xs h-11"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" />Resend verification email</>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full max-w-xs h-11"
            onClick={() => signOut({ callbackUrl: `/${locale ?? "en"}/login` })}
          >
            Back to sign in
          </Button>
        </div>
      )}
    </div>
  );
}
