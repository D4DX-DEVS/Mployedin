"use client";

/**
 * The employer's requirements checklist for one applicant, and the one-word
 * badge that rolls it up. Data comes from lib/matching/qualifications.ts via
 * the application document; this file only renders it.
 *
 * Status is never colour alone: every state carries an icon and a word.
 */

import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, CircleDashed, HelpCircle, MinusCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocalizedCountryName } from "@/lib/i18n/locations";

export type RequirementsStatus = "met" | "not_met" | "unverified";

export interface QualificationItem {
  key: string;
  status: "met" | "partial" | "not_met" | "unknown";
  hard: boolean;
  required?: string;
  actual?: string;
  questionId?: string;
  label?: string;
}

const BADGE_STYLE: Record<RequirementsStatus, { icon: typeof CheckCircle2; className: string }> = {
  met: { icon: CheckCircle2, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" },
  not_met: { icon: XCircle, className: "border-rose-500/30 bg-rose-500/10 text-rose-700" },
  unverified: { icon: HelpCircle, className: "border-amber-500/30 bg-amber-500/10 text-amber-800" },
};

interface RequirementsBadgeProps {
  status?: RequirementsStatus | null;
  /** One short word for a narrow column; the full wording stays in the tooltip and for screen readers. */
  compact?: boolean;
  className?: string;
}

/** "Meets requirements" / "Doesn't meet requirements" / "Unverified". Renders nothing before scoring. */
export function RequirementsBadge({ status, compact = false, className }: RequirementsBadgeProps) {
  const t = useTranslations("employerAts");
  if (!status) return null;
  const { icon: Icon, className: tone } = BADGE_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border font-semibold",
        compact ? "gap-0.5 px-1.5 py-0.5 text-[10px]" : "gap-1 px-2 py-0.5 text-[11px]",
        tone,
        className,
      )}
      title={t(`statusHint.${status}`)}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {compact ? (
        <>
          <span aria-hidden="true">{t(`statusShort.${status}`)}</span>
          <span className="sr-only">{t(`status.${status}`)}</span>
        </>
      ) : (
        t(`status.${status}`)
      )}
    </span>
  );
}

const ITEM_STYLE: Record<QualificationItem["status"], { icon: typeof CheckCircle2; className: string }> = {
  met: { icon: CheckCircle2, className: "text-emerald-600" },
  partial: { icon: MinusCircle, className: "text-amber-600" },
  not_met: { icon: XCircle, className: "text-rose-600" },
  unknown: { icon: CircleDashed, className: "text-muted-foreground" },
};

/** "united arab emirates, india" → "United Arab Emirates, India" (stored lower-cased). */
function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * The location check stores country keys — ISO codes ("bh") or names
 * ("india") — so a list reads "Bahrain, India" in the viewer's language.
 */
function countryNames(value: string, locale: string): string {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/^[a-z]{2}$/i.test(part)) {
        try {
          return new Intl.DisplayNames([locale], { type: "region" }).of(part.toUpperCase()) ?? part.toUpperCase();
        } catch {
          return part.toUpperCase();
        }
      }
      const name = getLocalizedCountryName(part, locale);
      return name && name !== part ? name : titleCase(part);
    })
    .join(", ");
}

const WORK_MODES = ["onsite", "hybrid", "remote"] as const;

const CHECK_KEYS = ["experience", "education", "skills", "industry", "location", "salary", "work_mode", "languages", "screening", "cv"] as const;

/** lib/cv/parsedCv.ts CvState — carried in the cv check's `actual`. */
const CV_STATES = ["read", "reading", "unreadable", "none"] as const;
type CvState = (typeof CV_STATES)[number];
const cvStateOf = (value?: string): CvState =>
  (CV_STATES as readonly string[]).includes(value ?? "") ? (value as CvState) : "none";

/** lib/matching/industry.ts INDUSTRY_KEYS — the ones with a label. */
const INDUSTRY_KEYS = [
  "food_fmcg", "retail", "hospitality", "travel", "healthcare", "pharma", "construction", "real_estate",
  "manufacturing", "automotive", "it_software", "banking_finance", "insurance", "education", "logistics",
  "oil_gas", "telecom", "media", "professional_services", "staffing",
] as const;

interface RequirementsChecklistProps {
  checks?: QualificationItem[] | null;
  status?: RequirementsStatus | null;
  matchedSkills?: string[] | null;
  missingSkills?: string[] | null;
  weightsApplied?: boolean | null;
  className?: string;
}

export function RequirementsChecklist({
  checks,
  status,
  matchedSkills,
  missingSkills,
  weightsApplied,
  className,
}: RequirementsChecklistProps) {
  const t = useTranslations("employerAts");
  const locale = useLocale();
  const items = checks ?? [];
  const has = matchedSkills ?? [];
  const missing = missingSkills ?? [];
  if (!status && items.length === 0) return null;

  const notStated = t("notStated");
  const level = (value?: string) => {
    const n = Number(value);
    return n >= 1 && n <= 5 ? t(`levels.${n}`) : notStated;
  };

  function detail(check: QualificationItem): string {
    const required = check.required ?? "";
    const actual = check.actual || notStated;
    switch (check.key) {
      case "experience":
        return t("detail.experience", { required, actual });
      case "education":
        return t("detail.education", { required: level(check.required), actual: level(check.actual) });
      case "skills":
        return t("detail.skills", { required, actual: check.actual ?? "0" });
      case "industry": {
        const names = required
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean)
          .map((key) => ((INDUSTRY_KEYS as readonly string[]).includes(key) ? t(`industries.${key}`) : key))
          .join(", ");
        if (check.actual) return t("detail.industryYears", { required: names, actual: check.actual });
        return t(check.status === "partial" ? "detail.industryMention" : "detail.industryNone", { required: names });
      }
      case "location":
        return t("detail.location", {
          required: countryNames(required, locale),
          actual: check.actual ? countryNames(check.actual, locale) : notStated,
        });
      case "salary":
        return t("detail.salary", { required, actual });
      case "work_mode": {
        const mode = (value: string) =>
          (WORK_MODES as readonly string[]).includes(value) ? t(`workModes.${value}`) : value;
        return t("detail.workMode", { required: mode(required), actual: mode(check.actual ?? "") || notStated });
      }
      case "languages":
        return t("detail.languages", { required, actual });
      case "screening":
        // A soft screening check is a preferred answer, not a qualifying one.
        return t(check.hard ? "detail.screening" : "detail.screeningPreferred", { required, actual });
      case "cv": {
        const file = { hasFile: check.label ? "yes" : "no", file: check.label ?? "" };
        switch (cvStateOf(check.actual)) {
          case "read":
            return t("detail.cvRead", file);
          case "reading":
            return t("detail.cvReading");
          case "unreadable":
            return t("detail.cvUnreadable", file);
          default:
            return t("detail.cvNone");
        }
      }
      default:
        return "";
    }
  }

  const title = (check: QualificationItem) =>
    check.key === "screening" && check.label
      ? check.label
      : (CHECK_KEYS as readonly string[]).includes(check.key)
        ? t(`check.${check.key}`)
        : check.key;

  return (
    <div className={cn("workspace-glass-panel card-pad rounded-2xl", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("requirements")}</p>
        <RequirementsBadge status={status} />
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((check) => {
            const { icon: Icon, className: tone } = ITEM_STYLE[check.status];
            return (
              <li key={`${check.key}-${check.questionId ?? ""}`} className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-foreground">
                    <span className="min-w-0 break-words">{title(check)}</span>
                    <span className={cn("text-[11px] font-semibold", tone)}>
                      {check.key === "cv" ? t(`cvState.${cvStateOf(check.actual)}`) : t(`itemStatus.${check.status}`)}
                    </span>
                    {check.hard ? (
                      <span className="rounded border border-border px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("hardTag")}
                      </span>
                    ) : null}
                  </p>
                  <p className="break-words text-[11px] text-muted-foreground">{detail(check)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{t("noneStated")}</p>
      )}

      {has.length > 0 || missing.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
          {has.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("hasSkills")}</span>
              {has.map((skill) => (
                <span key={skill} className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
          {missing.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t("missingSkills")}</span>
              {missing.map((skill) => (
                <span key={skill} className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                  <XCircle className="size-3" aria-hidden="true" />
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {weightsApplied ? <p className="mt-3 text-[11px] text-muted-foreground">{t("weightsApplied")}</p> : null}
    </div>
  );
}
