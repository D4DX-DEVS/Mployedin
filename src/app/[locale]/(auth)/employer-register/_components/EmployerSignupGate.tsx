"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Building2, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type GateState = "loading" | "open" | "closed" | "invite_invalid" | "invite_paused";

interface OnboardingResponse {
  employerSelfRegistrationEnabled?: boolean;
  invite?: "valid" | "invalid" | "paused" | null;
}

interface EmployerSignupGateProps {
  locale: string;
  referralCode: string;
  children: ReactNode;
}

/**
 * Admin → Settings → Employer onboarding decides who sees the sign-up form:
 * a live employer invite link always does (while invite links are on); anyone
 * else only while public employer sign-up is on. Everyone else gets a short
 * notice and a way to reach our team. The API enforces the same rule.
 */
export function EmployerSignupGate({ locale, referralCode, children }: EmployerSignupGateProps) {
  const t = useTranslations("employerAccess.signup");
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let alive = true;
    const query = referralCode ? `?ref=${encodeURIComponent(referralCode)}` : "";
    fetch(`/api/public/employer-onboarding${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<OnboardingResponse>) : null))
      .catch(() => null)
      .then((data) => {
        if (!alive) return;
        // Can't tell: show the form and let the server decide on submit.
        if (!data) return setState("open");
        if (referralCode && data.invite === "valid") return setState("open");
        if (data.employerSelfRegistrationEnabled) return setState("open");
        if (referralCode) return setState(data.invite === "paused" ? "invite_paused" : "invite_invalid");
        setState("closed");
      });
    return () => {
      alive = false;
    };
  }, [referralCode]);

  if (state === "open") return <>{children}</>;

  if (state === "loading") {
    return (
      <div className="flex w-full flex-col gap-4" aria-busy="true">
        <Skeleton className="mx-auto h-8 w-2/3" />
        <Skeleton className="mx-auto h-4 w-1/2" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  const isInvite = state === "invite_invalid" || state === "invite_paused";
  const Icon = isInvite ? LinkIcon : Building2;

  return (
    <div className="flex w-full flex-col items-center gap-5 text-center" data-testid="employer-signup-closed">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {isInvite ? t("inviteTitle") : t("closedTitle")}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {state === "invite_invalid" ? t("inviteInvalidBody") : state === "invite_paused" ? t("invitePausedBody") : t("closedBody")}
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="min-h-11 rounded-xl">
          <Link href={`/${locale}/contact`}>{t("contactUs")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="min-h-11 rounded-xl">
          <Link href={`/${locale}/login`}>{t("signIn")}</Link>
        </Button>
      </div>
    </div>
  );
}
