"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";
import { FileCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TermsAgreement } from "./TermsAgreement";

export type AcceptTermsState = "first" | "updated" | "accepted" | "signedOut";

/**
 * /accept-terms. The proxy sends a signed-in user here while their session
 * says they owe an acceptance: accounts staff made for them, accounts older
 * than per-user acceptance, and everyone after an admin starts a new version.
 *
 * After recording, the session is refreshed with update({ termsAccepted }) —
 * the server re-reads the user, it never trusts the payload — and the user
 * leaves with a full page load: a client navigation can replay the proxy's
 * cached redirect back to this page (see verify-email's SuccessCTA).
 */
export function AcceptTermsForm({
  locale,
  state,
  changedOn,
  destination,
}: {
  locale: string;
  state: AcceptTermsState;
  /** When the current version started, already formatted; shown for "updated". */
  changedOn?: string;
  destination: string;
}) {
  const t = useTranslations("auth");
  const { status, update } = useSession();
  const [agreed, setAgreed] = useState(false);
  const [showTickError, setShowTickError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const leave = async () => {
    // update() is a no-op until the session has loaded; the proxy re-checks anyway.
    const refreshed = status === "authenticated" ? await update({ termsAccepted: true }) : null;
    const stillPending = (refreshed?.user as { termsPending?: boolean } | undefined)?.termsPending === true;
    if (stillPending) {
      setError(t("acceptTerms.sessionNotUpdated"));
      return false;
    }
    window.location.assign(destination);
    return true;
  };

  const handleAccept = async () => {
    if (!agreed) {
      setShowTickError(true);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/user/terms-acceptance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      if (!res.ok) {
        setError(t("acceptTerms.saveError"));
        setSubmitting(false);
        return;
      }
      if (!(await leave())) setSubmitting(false);
    } catch {
      setError(t("acceptTerms.saveError"));
      setSubmitting(false);
    }
  };

  const handleContinue = async () => {
    setSubmitting(true);
    setError("");
    try {
      if (!(await leave())) setSubmitting(false);
    } catch {
      setError(t("acceptTerms.saveError"));
      setSubmitting(false);
    }
  };

  const signOutToLogin = () => signOut({ callbackUrl: `/${locale}/login` });

  if (state === "signedOut") {
    return (
      <div className="w-full space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("acceptTerms.signedOutTitle")}</h1>
          <p className="text-base text-muted-foreground">{t("acceptTerms.signedOutDescription")}</p>
        </div>
        {/* Signing out clears a session cookie the server no longer honours;
            a plain link to /login would bounce straight back here. */}
        <Button className="min-h-11 w-full" onClick={signOutToLogin}>
          {t("acceptTerms.signInAgain")}
        </Button>
      </div>
    );
  }

  const title =
    state === "accepted" ? t("acceptTerms.titleDone") : state === "updated" ? t("acceptTerms.titleUpdated") : t("acceptTerms.title");
  const description =
    state === "accepted"
      ? t("acceptTerms.descriptionDone")
      : state === "updated"
        ? t("acceptTerms.descriptionUpdated", { date: changedOn ?? "" })
        : t("acceptTerms.description");

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1.5">
        <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileCheck2 className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-base text-muted-foreground">{description}</p>
      </div>

      {state === "accepted" ? (
        <Button className="min-h-11 w-full" onClick={handleContinue} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {t("acceptTerms.continueButton")}
        </Button>
      ) : (
        <>
          <div>
            <TermsAgreement
              id="accept-terms"
              locale={locale}
              checked={agreed}
              onCheckedChange={(v) => {
                setAgreed(v);
                if (v) setShowTickError(false);
              }}
              errorId={showTickError ? "accept-terms-error" : undefined}
            />
            {showTickError ? (
              <p id="accept-terms-error" className="mt-1 text-sm text-destructive">{t("mustAgreeToTerms")}</p>
            ) : null}
          </div>
          <Button className="min-h-11 w-full" onClick={handleAccept} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("acceptTerms.acceptButton")}
          </Button>
        </>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        {t("acceptTerms.notNow")}{" "}
        <button
          type="button"
          onClick={signOutToLogin}
          className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("acceptTerms.signOut")}
        </button>
      </p>
    </div>
  );
}
