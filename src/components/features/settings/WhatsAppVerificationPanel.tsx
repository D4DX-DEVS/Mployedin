"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, MessageCircle, PhoneOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What GET /api/user/notification-preferences reports as `whatsappVerification`. */
export interface WhatsAppVerification {
  /** A START verified the profile phone, and no STOP (on the account or the number) stands since. */
  verified: boolean;
  /** wa.me to the business number with `START <code>` typed; null in mock mode, when Meta cannot be reached, or with no code. */
  waLink: string | null;
  /** The profile phone's last 4 digits; null when the profile has no phone. */
  phoneLast4: string | null;
  /** False when the profile phone cannot be read as an international number (no country code), or is missing. */
  phoneValid: boolean;
  /**
   * The account's personal code, sent as `START <code>`: only that START, from the profile phone, verifies this
   * account. Present only while the account is not verified and its phone is valid; null if it could not be made.
   */
  startCode: string | null;
}

/**
 * Where the page's user edits the phone WhatsApp sends to (`User.phone`), for
 * the copy that asks them to add or fix it: the job seeker's profile, the
 * Profile & Avatar tab of the agent and super-agent settings, or nowhere (an
 * employer's profile phone is the company's, not theirs).
 */
export type PhoneEditPlace = "profile" | "settingsProfileTab" | "none";

type CategoryPrefs = Record<string, { enabled?: boolean; channels?: readonly string[] } | undefined>;

/** A WhatsApp channel is on in a category that is itself on (the page hides the channels of one that is off). */
export function hasWhatsAppOn(categories: CategoryPrefs): boolean {
  return Object.values(categories).some((c) => c?.enabled !== false && (c?.channels ?? []).includes("whatsapp"));
}

interface WhatsAppVerificationPanelProps {
  verification: WhatsAppVerification | null;
  /** From the page's current preferences, saved or not, so the panel shows as soon as the user turns WhatsApp on. */
  whatsAppOn: boolean;
  /**
   * For pages with no WhatsApp channel toggle (employer, agent, super-agent): a START is how those accounts turn
   * WhatsApp on, so an unverified user with no channel on is invited to send one. Hidden once verified, and while
   * the phone is missing or has no country code: an invitation nobody can act on (an employer cannot even edit their
   * own phone) would stay on the page for good.
   */
  invite?: boolean;
  phoneEditPlace?: PhoneEditPlace;
}

/** An amber notice with an icon: the no-phone and no-country-code states, which offer no button. */
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 card-pad">
      <div className="flex items-start gap-3">
        <PhoneOff className="size-5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-sm text-amber-800">{children}</p>
      </div>
    </div>
  );
}

/**
 * WhatsApp messages start only after the user sends START with their personal
 * code from the phone on their profile (Meta's signed webhook confirms the
 * number). The button types `START <code>`; the panel also shows that text for
 * anyone who cannot use the button. Shared by the job-seeker, employer, agent
 * and super-agent notification settings.
 */
export function WhatsAppVerificationPanel({ verification, whatsAppOn, invite = false, phoneEditPlace = "profile" }: WhatsAppVerificationPanelProps) {
  const t = useTranslations("whatsappVerificationPanel");
  if (!verification) return null;
  const inviting = invite && !whatsAppOn;
  if (!whatsAppOn && !inviting) return null;
  if (inviting && (verification.verified || !verification.phoneLast4 || !verification.phoneValid)) return null;

  // Literal keys per place (never built from a variable), so a missing key fails the key checks, not the page.
  if (!verification.phoneLast4) {
    const text = phoneEditPlace === "settingsProfileTab" ? t("noPhoneSettingsProfile") : phoneEditPlace === "none" ? t("noPhoneNoEdit") : t("noPhone");
    return <Notice>{text}</Notice>;
  }

  if (!verification.phoneValid) {
    const text =
      phoneEditPlace === "settingsProfileTab" ? t("noCountryCodeSettingsProfile") : phoneEditPlace === "none" ? t("noCountryCodeNoEdit") : t("noCountryCode");
    return <Notice>{text}</Notice>;
  }

  if (verification.verified) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-green-700">
        <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">{t("verified")}</span>
        <span>{t("verifiedTo", { last4: verification.phoneLast4 })}</span>
      </p>
    );
  }

  // With a code, the copy points at the text shown below it (START and the code, which the button types). Without one
  // (it could not be made, so there is no button either) the plain wording stays.
  const last4 = verification.phoneLast4;
  const body = verification.startCode
    ? inviting
      ? t("inviteBodyWithCode", { last4 })
      : t("bodyWithCode", { last4 })
    : inviting
      ? t("inviteBody", { last4 })
      : t("body", { last4 });

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 card-pad">
      <div className="flex items-start gap-3">
        <MessageCircle className="size-5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-amber-900">{inviting ? t("inviteTitle") : t("title")}</p>
          <p className="text-xs text-amber-800">{body}</p>
          {verification.startCode ? <p className="text-sm font-semibold text-amber-900">{t("sendCode", { code: verification.startCode })}</p> : null}
          {verification.waLink ? (
            <a
              href={verification.waLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "sm" }), "min-h-11 gap-2")}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {t("openWhatsApp")}
            </a>
          ) : (
            <p className="text-xs text-amber-800">{t("notConnected")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
