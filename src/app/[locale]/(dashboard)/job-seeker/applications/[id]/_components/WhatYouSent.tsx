"use client";

import { useTranslations } from "next-intl";
import { ClipboardList, Mail } from "lucide-react";

interface ScreeningAnswer {
  questionId?: string;
  questionLabel: string;
  answer: unknown;
}

interface WhatYouSentProps {
  coverLetter?: string;
  screeningAnswers?: ScreeningAnswer[];
  /** The documents section, which keeps its own add/remove controls. */
  children: React.ReactNode;
}

/**
 * What the seeker submitted: cover letter, screening answers and documents.
 * Indeed's "View application" shows the same; the answers were stored on 28
 * applications but never shown back to the person who gave them.
 */
export function WhatYouSent({ coverLetter, screeningAnswers = [], children }: WhatYouSentProps) {
  const t = useTranslations("applicationDetail");

  const answerText = (answer: unknown): string => {
    if (typeof answer === "boolean") return answer ? t("answerYes") : t("answerNo");
    if (Array.isArray(answer)) return answer.map(String).join(", ");
    if (answer === null || answer === undefined || answer === "") return "—";
    return String(answer);
  };

  return (
    <section className="space-y-3" aria-labelledby="what-you-sent-heading">
      <h2 id="what-you-sent-heading" className="heading-section font-semibold">{t("sentTitle")}</h2>

      {coverLetter?.trim() && (
        <div className="card-base rounded-2xl border panel-body">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-muted-foreground" aria-hidden="true" /> {t("coverLetter")}
          </h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{coverLetter}</p>
        </div>
      )}

      {screeningAnswers.length > 0 && (
        <div className="card-base rounded-2xl border panel-body">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" /> {t("screeningAnswers")}
          </h3>
          <dl className="mt-3 space-y-3">
            {screeningAnswers.map((qa, i) => (
              <div key={qa.questionId ?? i}>
                <dt className="text-sm text-foreground">{qa.questionLabel}</dt>
                <dd className="mt-0.5 text-sm font-medium text-muted-foreground">{answerText(qa.answer)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {children}
    </section>
  );
}
