"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Asked when a Google, LinkedIn, Apple or e-mail-code sign-in would create a
 * new account: the same Terms & Privacy consent the e-mail sign-up form asks
 * for, before the account exists (see lib/auth/signupConsent.ts).
 *
 * `ask()` opens it and resolves true once the box is ticked and confirmed,
 * false when the person backs out.
 */
export function useSignupConsentPrompt(locale: string) {
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  const dialog = <SignupConsentDialog locale={locale} open={open} onConfirm={() => finish(true)} onCancel={() => finish(false)} />;
  return { ask, dialog };
}

function SignupConsentDialog({ locale, open, onConfirm, onCancel }: {
  locale: string;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("auth");
  const [agreed, setAgreed] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setAgreed(false);
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("signupConsentTitle")}</DialogTitle>
          <DialogDescription>{t("signupConsentDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-11 items-start gap-3 rounded-xl p-1">
          <Checkbox
            id="signup-consent-terms"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            className="mt-0.5"
          />
          <label htmlFor="signup-consent-terms" className="text-sm leading-5 text-muted-foreground">
            {t("agreeToTerms")}{" "}
            <Link href={`/${locale}/terms`} className="text-primary hover:underline" target="_blank">
              {t("termsOfService")}
            </Link>{" "}
            {t("and")}{" "}
            <Link href={`/${locale}/privacy`} className="text-primary hover:underline" target="_blank">
              {t("privacyPolicyLink")}
            </Link>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setAgreed(false);
              onCancel();
            }}
          >
            {t("signupConsentCancel")}
          </Button>
          <Button
            disabled={!agreed}
            onClick={() => {
              setAgreed(false);
              onConfirm();
            }}
          >
            {t("signupConsentContinue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
