"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/shared/FieldError";
import { CaptchaNotice } from "@/components/shared/CaptchaNotice";
import { csrfFetch } from "@/lib/security/csrf-client";
import { getCaptchaToken } from "@/lib/browser/captcha";
import { CONSENT_REQUIRED_CODE } from "@/lib/auth/signupConsent";
import { EMAIL_PATTERN } from "@/lib/errors/email-pattern";

const RESEND_WAIT_SECONDS = 30;

interface EmailCodeLoginProps {
  /** The address already typed in the password form, if any. */
  initialEmail: string;
  /** Where "Create an account" leads when the address has no account. */
  registerHref: string;
  /** Called once the session exists; the page decides where to go. */
  onSignedIn: () => Promise<void> | void;
  onBack: () => void;
}

type Step = "email" | "code";
type Problem = { message: string; offerRegister?: boolean };

/**
 * Log in with a 6-digit code sent by e-mail, for job seekers.
 *
 * An account made on a shared job link has no password, and the login page
 * offered only a password and the social buttons, so the way back in was
 * "Forgot password". This reuses that same code system (POST
 * /api/auth/apply-otp/start, the "email-otp" provider) without a name, which
 * the server reads as "sign in only": an address with no job seeker account is
 * sent nothing, and no account is ever made from here.
 */
export function EmailCodeLogin({ initialEmail, registerHref, onSignedIn, onBack }: EmailCodeLoginProps) {
  const t = useTranslations("auth");
  const tf = useTranslations("formErrors");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    setProblem(null);
    const address = email.trim();
    if (!address) {
      setFieldError(tf("emailRequired"));
      return;
    }
    if (!EMAIL_PATTERN.test(address)) {
      setFieldError(tf("emailInvalid"));
      return;
    }
    setFieldError("");
    setBusy(true);
    try {
      // Same invisible captcha and action as the apply form's "Send code".
      const captchaToken = await getCaptchaToken("quick_apply");
      const res = await csrfFetch("/api/auth/apply-otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, ...(captchaToken ? { captchaToken } : {}) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        const reason = data?.error;
        setProblem({
          message:
            reason === "INVALID_EMAIL" ? tf("emailInvalid")
              : reason === "RATE_LIMITED" ? t("codeLoginRateLimited")
                : reason === "EMAIL_FAILED" ? t("codeLoginEmailFailed")
                  : reason === "CAPTCHA_FAILED" || reason === "CAPTCHA_REQUIRED" || reason === "CAPTCHA_UNAVAILABLE"
                    ? t("codeLoginCaptchaFailed")
                    : t("codeLoginFailed"),
        });
        return;
      }
      setCode("");
      setStep("code");
      setResendIn(RESEND_WAIT_SECONDS);
    } catch {
      setProblem({ message: t("codeLoginFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setProblem(null);
    if (code.length !== 6) {
      setFieldError(t("codeLoginCodeRequired"));
      return;
    }
    setFieldError("");
    setBusy(true);
    try {
      const res = await signIn("email-otp", { email: email.trim(), otp: code, redirect: false });
      if ((res as { code?: string } | undefined)?.code === CONSENT_REQUIRED_CODE) {
        // The code is right but belongs to no account (requested on a job
        // page, never finished). Logging in does not create one.
        setProblem({ message: t("codeLoginNoAccount"), offerRegister: true });
        return;
      }
      if (!res || res.error) {
        setProblem({ message: t("codeLoginInvalid") });
        return;
      }
      await onSignedIn();
    } catch {
      setProblem({ message: t("codeLoginFailed") });
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "h-11 rounded-xl border-border/70 bg-background/70 px-4 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-0";

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        void (step === "email" ? sendCode() : verify());
      }}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">{t("codeLoginTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("codeLoginHint")}</p>
      </div>

      {step === "email" ? (
        <div className="field">
          <Label htmlFor="code-login-email" required className="text-sm font-medium">{t("emailAddress")}</Label>
          <Input
            id="code-login-email"
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldError(""); }}
            autoComplete="email"
            autoFocus
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "code-login-email-error" : undefined}
            className={fieldClass}
          />
          <FieldError id="code-login-email-error" message={fieldError} />
        </div>
      ) : (
        <div className="field">
          <p id="code-login-sent" role="status" className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-sm text-foreground">
            {t("codeLoginSent", { email: email.trim() })}
          </p>
          <Label htmlFor="code-login-code" required className="mt-3 text-sm font-medium">{t("codeLoginCodeLabel")}</Label>
          <Input
            id="code-login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setFieldError(""); }}
            autoFocus
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={`code-login-sent${fieldError ? " code-login-code-error" : ""}`}
            className={`${fieldClass} text-center text-lg tracking-[0.4em]`}
          />
          <FieldError id="code-login-code-error" message={fieldError} />
        </div>
      )}

      {problem && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium leading-5 text-destructive">{problem.message}</p>
              {problem.offerRegister && (
                <Link
                  href={registerHref}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-destructive underline underline-offset-4"
                >
                  {t("codeLoginRegister")}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <Button
        size="lg"
        type="submit"
        className="w-full rounded-xl text-sm font-semibold shadow-lg shadow-primary/20"
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
        ) : step === "email" ? (
          <Mail className="me-2 size-4" aria-hidden="true" />
        ) : (
          <ArrowRight className="me-2 size-4 rtl:rotate-180" aria-hidden="true" />
        )}
        {step === "email" ? t("codeLoginSend") : t("codeLoginVerify")}
      </Button>

      {step === "email" && <CaptchaNotice />}

      <div className="flex flex-wrap items-center justify-between gap-x-4">
        {step === "code" && (
          <>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy || resendIn > 0}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary transition-colors hover:text-primary/80 disabled:text-muted-foreground"
            >
              {resendIn > 0 ? t("codeLoginResendIn", { seconds: resendIn }) : t("codeLoginResend")}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setProblem(null); setFieldError(""); }}
              disabled={busy}
              className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("codeLoginChangeEmail")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("codeLoginBack")}
        </button>
      </div>
    </form>
  );
}
