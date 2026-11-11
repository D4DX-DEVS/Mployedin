"use client";

import { useTranslations } from "next-intl";
import { CircleCheck, CircleHelp, CircleMinus, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LineVerdict, QualificationLineCheck } from "@/lib/matching/qualificationLines";

const VERDICT_STYLE: Record<LineVerdict, { icon: typeof CircleCheck; tone: string }> = {
  has: { icon: CircleCheck, tone: "text-emerald-600" },
  partial: { icon: CircleMinus, tone: "text-amber-600" },
  missing: { icon: CircleX, tone: "text-rose-600" },
  unknown: { icon: CircleHelp, tone: "text-muted-foreground" },
};

interface QualificationLineListProps {
  checks: QualificationLineCheck[];
  className?: string;
}

/**
 * The qualifications the employer wrote on the job, each with the verdict for
 * this candidate and the evidence behind it. Status is never colour alone: the
 * verdict is a word and an icon.
 */
export function QualificationLineList({ checks, className }: QualificationLineListProps) {
  const t = useTranslations("agentJobMatches.lines");
  const levels = useTranslations("employerAts.levels");
  if (checks.length === 0) return null;

  const level = (n?: number) => (n && n >= 1 && n <= 5 ? levels(String(n) as "1") : "");
  const list = (items: string[]) => items.join(", ");
  const has = checks.filter((check) => check.verdict === "has").length;

  function detail(check: QualificationLineCheck): string {
    switch (check.kind) {
      case "education":
        return check.actual
          ? t("detail.education", { required: level(check.required), actual: level(check.actual) })
          : t("detail.educationNone", { required: level(check.required) });
      case "experience":
        return check.actual !== undefined
          ? t("detail.experience", { required: check.required ?? 0, actual: check.actual })
          : t("detail.experienceNone", { required: check.required ?? 0 });
      case "language":
        return [
          check.found.length > 0 ? t("detail.languageHas", { list: list(check.found) }) : "",
          check.missing.length > 0 ? t("detail.languageMissing", { list: list(check.missing) }) : "",
        ]
          .filter(Boolean)
          .join(" · ");
      case "personal":
        return t("detail.personal");
      case "thin":
        return t("detail.thin");
      default:
        return [
          check.found.length > 0 ? t("detail.found", { list: list(check.found) }) : "",
          check.missing.length > 0 ? t("detail.notFound", { list: list(check.missing) }) : "",
        ]
          .filter(Boolean)
          .join(" · ");
    }
  }

  return (
    <div className={cn("rounded-2xl border border-border/60 p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("title")}</p>
        <span className="text-[11px] font-medium text-muted-foreground">{t("summary", { has, total: checks.length })}</span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {checks.map((check) => {
          const { icon: Icon, tone } = VERDICT_STYLE[check.verdict];
          return (
            <li key={check.line} className="flex items-start gap-2">
              <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-medium text-foreground">{check.line}</p>
                <p className="break-words text-[11px] text-muted-foreground">
                  <span className={cn("font-semibold", tone)}>{t(`verdict.${check.verdict}`)}</span>
                  {detail(check) ? ` · ${detail(check)}` : ""}
                </p>
                {check.quotes?.map((quote) => (
                  <p key={quote} className="break-words text-[11px] italic text-muted-foreground/80" dir="auto">
                    “{quote}”
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">{t("note")}</p>
    </div>
  );
}
