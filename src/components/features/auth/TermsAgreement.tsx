"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * "I agree to the Terms of Service and Privacy Policy", with both documents
 * opening in a new tab so the form keeps its state. Used wherever an account
 * is created or a user is asked to accept (again): the sign-up consent dialog,
 * agent sign-up and /accept-terms. Reads the `auth` namespace, which every
 * auth-group page ships.
 */
export function TermsAgreement({
  id,
  locale,
  checked,
  onCheckedChange,
  errorId,
}: {
  id: string;
  locale: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The id of the field error shown under the box, when there is one. */
  errorId?: string;
}) {
  const t = useTranslations("auth");
  return (
    <div className="flex min-h-11 items-start gap-3 rounded-xl p-1">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId}
        className="mt-0.5"
      />
      <label htmlFor={id} className="text-sm leading-5 text-muted-foreground">
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
  );
}
