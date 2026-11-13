"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LinkPasswordKey = "emptyError" | "wrongPassword" | "tooManyAttempts";

/**
 * The `linkPassword` message for a refusal from lib/auth/passwordHolder.ts
 * (the API's `code`), or null for any other answer.
 */
export function linkPasswordErrorKey(code: unknown): LinkPasswordKey | null {
  if (code === "PASSWORD_REQUIRED") return "emptyError";
  if (code === "WRONG_PASSWORD") return "wrongPassword";
  if (code === "TOO_MANY_ATTEMPTS") return "tooManyAttempts";
  return null;
}

/**
 * Lets the browser's password manager match the saved login: a password field
 * on its own is often not filled in.
 */
function UsernameHint({ email }: { email?: string }) {
  if (!email) return null;
  return <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />;
}

interface LinkPasswordStepProps {
  /** "verify": confirm an address; "change": confirm a new address. */
  purpose: "verify" | "change";
  locale: string;
  email?: string;
  busy: boolean;
  error: string;
  onSubmit: (password: string) => void;
}

/**
 * Shown when an emailed link is opened where its account is not signed in:
 * the link finishes only with the account's password
 * (lib/auth/passwordHolder.ts). Someone who does not know it is told that
 * ignoring the mail changes nothing, and how the owner gets in instead.
 */
export function LinkPasswordStep({ purpose, locale, email, busy, error, onSubmit }: LinkPasswordStepProps) {
  const t = useTranslations("linkPassword");
  const [password, setPassword] = useState("");
  const isVerify = purpose === "verify";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(password);
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
        <KeyRound className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t(isVerify ? "verifyTitle" : "changeTitle")}</h1>
        <p className="text-base text-muted-foreground font-light">{t(isVerify ? "verifyBody" : "changeBody")}</p>
      </div>

      <form onSubmit={submit} className="w-full max-w-xs space-y-3 text-left">
        <UsernameHint email={email} />
        <div className="space-y-1.5">
          <Label htmlFor="link-password">{t("passwordLabel")}</Label>
          <Input
            id="link-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "link-password-error" : undefined}
            className="h-12"
          />
        </div>
        {error && (
          <p id="link-password-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("checking")}
            </>
          ) : (
            t(isVerify ? "verifySubmit" : "changeSubmit")
          )}
        </Button>
      </form>

      <div className="w-full max-w-xs rounded-xl bg-muted/50 border text-left space-y-2 card-pad">
        <p className="text-sm font-medium text-foreground">{t("helpTitle")}</p>
        <p className="text-xs text-muted-foreground">{t(isVerify ? "verifyHelpIgnore" : "changeHelpIgnore")}</p>
        {isVerify && (
          <>
            <p className="text-xs text-muted-foreground">
              {t("verifyHelpReset")}{" "}
              <Link href={`/${locale}/forgot-password`} className="text-primary font-medium hover:underline">
                {t("resetLink")}
              </Link>
            </p>
            {/* A code login also removes a stranger's password (job seekers only). */}
            <p className="text-xs text-muted-foreground">
              {t("verifyHelpCode")}{" "}
              <Link href={`/${locale}/login`} className="text-primary font-medium hover:underline">
                {t("codeLoginLink")}
              </Link>
            </p>
          </>
        )}
        {/* An agent still waiting for approval can neither sign in nor reset. */}
        <p className="text-xs text-muted-foreground">
          {t("stillStuck")}{" "}
          <Link href={`/${locale}/contact`} className="text-primary font-medium hover:underline">
            {t("contactSupport")}
          </Link>
        </p>
      </div>
    </div>
  );
}

interface CodePasswordFieldProps {
  email?: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

/**
 * The password beside the 6-digit code, for a code typed where the account is
 * not signed in (an agent awaiting approval, an employer who just registered).
 */
export function CodePasswordField({ email, value, disabled, onChange }: CodePasswordFieldProps) {
  const t = useTranslations("linkPassword");
  return (
    <div className="space-y-1.5 text-left">
      <UsernameHint email={email} />
      <Label htmlFor="code-password">{t("codePasswordLabel")}</Label>
      <Input
        id="code-password"
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-describedby="code-password-hint"
        className="h-12"
      />
      <p id="code-password-hint" className="text-xs text-muted-foreground">
        {t("codePasswordHint")}
      </p>
    </div>
  );
}
