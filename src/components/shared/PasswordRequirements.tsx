"use client";

import { useTranslations } from "next-intl";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPasswordIssues, PASSWORD_MIN_LENGTH, type PasswordIssue } from "@/lib/security/passwordPolicy";

const RULES: { issue: PasswordIssue; key: string }[] = [
  { issue: "tooShort", key: "minLength" },
  { issue: "noUppercase", key: "uppercase" },
  { issue: "noLowercase", key: "lowercase" },
  { issue: "noNumber", key: "number" },
  { issue: "noSymbol", key: "symbol" },
];

interface PasswordRequirementsProps {
  password: string;
  /** Lets the password input point `aria-describedby` at the list. */
  id?: string;
  className?: string;
}

/**
 * The password rules shown while the person types, each ticked off as it is
 * met. Reads `getPasswordIssues`, the same rules the server enforces, so the
 * list can never promise a password the API then rejects.
 */
export function PasswordRequirements({ password, id, className }: PasswordRequirementsProps) {
  const t = useTranslations("passwordRequirements");
  const issues = new Set(getPasswordIssues(password));

  return (
    <div id={id} className={cn("rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5", className)}>
      <p className="text-xs font-semibold text-foreground">{t("title")}</p>
      <ul className="mt-1.5 grid gap-1 sm:grid-cols-2" aria-live="polite">
        {RULES.map(({ issue, key }) => {
          const met = password.length > 0 && !issues.has(issue);
          return (
            <li key={key} className={cn("flex items-center gap-1.5 text-xs", met ? "text-emerald-700" : "text-muted-foreground")}>
              {met
                ? <Check className="size-3.5 shrink-0" aria-hidden="true" />
                : <Circle className="size-3.5 shrink-0" aria-hidden="true" />}
              <span>{t(key, { min: PASSWORD_MIN_LENGTH })}</span>
              <span className="sr-only">{met ? t("met") : t("notMet")}</span>
            </li>
          );
        })}
      </ul>
      {issues.has("common") && <p className="mt-1.5 text-xs font-medium text-destructive">{t("common")}</p>}
    </div>
  );
}
