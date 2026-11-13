"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetPasswordForm } from "@/components/features/auth/SetPasswordForm";

interface ApplyLoginNextTimeProps {
  /** The address the sign-in code was sent to. */
  email: string;
}

/**
 * Shown on the apply-success card to an account that has no password: one made
 * a minute ago by an e-mail code. Nothing told that person how to get back in
 * after logging out; the only ways were "Forgot password" or opening a job
 * link again. It says how (a code from the login page) and offers to set a
 * password here.
 *
 * Renders nothing for an account that has a password, and nothing when the
 * status cannot be read.
 */
export function ApplyLoginNextTime({ email }: ApplyLoginNextTimeProps) {
  const t = useTranslations("easyApply");
  const ts = useTranslations("setPassword");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    // Started inside a promise so a missing or stubbed fetch is a rejection
    // the catch below takes, never an exception in the effect.
    Promise.resolve()
      .then(() => fetch("/api/user/password-status"))
      .then((res) => (res?.ok ? res.json() : null))
      .then((data: { hasPassword?: boolean } | null) => {
        if (active && data?.hasPassword === false) setNeedsPassword(true);
      })
      .catch(() => {/* optional: applying is already done */});
    return () => {
      active = false;
    };
  }, []);

  if (saved) {
    return (
      <p role="status" className="flex items-start gap-1.5 rounded-2xl border border-emerald-500/30 bg-background p-3 text-start text-xs font-medium text-emerald-700">
        <Check className="mt-px size-4 shrink-0" aria-hidden="true" />
        {ts("saved")}
      </p>
    );
  }

  if (!needsPassword) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-background p-3 text-start">
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t("loginNextTimeTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("loginNextTimeBody", { email })}</p>
        </div>
      </div>
      {open ? (
        <SetPasswordForm idPrefix="apply" onSaved={() => setSaved(true)} onCancel={() => setOpen(false)} />
      ) : (
        <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>
          {t("setPasswordAction")}
        </Button>
      )}
    </div>
  );
}
