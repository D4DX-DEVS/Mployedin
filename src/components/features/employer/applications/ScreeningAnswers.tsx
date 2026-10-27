"use client";

/**
 * What one candidate answered to each screening question. The employer could
 * only see deal-breaker and preferred answers (on the requirements checklist)
 * or job-wide totals (Insights → Screening Answers), never what a candidate
 * wrote to an open question (client 2026-10-27: "where we can see the
 * answers").
 *
 * A question with a deal-breaker or preferred rule also says whether the
 * answer qualifies, with the checklist's icon and word — never colour alone.
 */

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { CheckCircle2, CircleDashed, MinusCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QualificationItem } from "./RequirementsChecklist";

export interface ScreeningAnswer {
  questionId: string;
  questionLabel: string;
  answer: unknown;
}

const RULE_STYLE: Record<QualificationItem["status"], { icon: typeof CheckCircle2; className: string }> = {
  met: { icon: CheckCircle2, className: "text-emerald-600" },
  partial: { icon: MinusCircle, className: "text-amber-600" },
  not_met: { icon: XCircle, className: "text-rose-600" },
  unknown: { icon: CircleDashed, className: "text-muted-foreground" },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

interface ScreeningAnswersProps {
  answers?: readonly ScreeningAnswer[] | null;
  /** The application's checklist; its screening items carry the rule outcomes. */
  checks?: readonly QualificationItem[] | null;
  className?: string;
}

export function ScreeningAnswers({ answers, checks, className }: ScreeningAnswersProps) {
  const t = useTranslations("employerAts");
  const format = useFormatter();
  // Candidates answer in their own language: each line takes its text
  // direction from its content (an English "?" stays at the end on the Arabic
  // page) but keeps the page's alignment, so the card reads as one column.
  // Set as a style: globals.css flips the text-left/right classes on RTL pages.
  const align = { textAlign: useLocale() === "ar" ? "right" : "left" } as const;
  if (!answers?.length) return null;

  const rules = new Map(
    (checks ?? [])
      .filter((check) => check.key === "screening" && check.questionId)
      .map((check) => [check.questionId as string, check]),
  );

  const answerText = (answer: unknown): string | null => {
    if (answer === null || answer === undefined) return null;
    if (typeof answer === "boolean") return t(answer ? "screeningAnswers.yes" : "screeningAnswers.no");
    if (Array.isArray(answer)) return answer.map(String).filter((v) => v.trim()).join(", ") || null;
    const text = String(answer).trim();
    if (!text) return null;
    if (ISO_DATE.test(text)) {
      const date = new Date(text);
      if (!Number.isNaN(date.getTime())) return format.dateTime(date, { dateStyle: "medium" });
    }
    return text;
  };

  return (
    <div className={cn("workspace-glass-panel card-pad rounded-2xl", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("screeningAnswers.title")}</p>
        <span className="text-[11px] text-muted-foreground">{t("screeningAnswers.count", { count: answers.length })}</span>
      </div>
      <dl className="mt-3 space-y-3">
        {answers.map((item, index) => {
          const value = answerText(item.answer);
          const rule = rules.get(item.questionId);
          const style = rule ? RULE_STYLE[rule.status] : null;
          return (
            <div key={`${item.questionId}-${index}`} className="space-y-1">
              <dt dir="auto" style={align} className="break-words text-xs font-medium text-foreground">{item.questionLabel}</dt>
              <dd
                dir={value ? "auto" : undefined}
                style={align}
                className={cn("whitespace-pre-wrap break-words text-xs", value ? "text-foreground/90" : "italic text-muted-foreground")}
              >
                {value ?? t("screeningAnswers.noAnswer")}
              </dd>
              {rule && style ? (
                <dd className={cn("flex flex-wrap items-center gap-1 text-[11px] font-semibold", style.className)}>
                  <style.icon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>{t(rule.hard ? "knockout.toggle" : "knockout.preferredToggle")}:</span>
                  <span>{t(`itemStatus.${rule.status}`)}</span>
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
