"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatApplicationDate } from "@/lib/jobSeeker/applicationFormat";
import type { BackgroundCheckItem } from "./types";

const TYPE_KEYS = { background: "typeBackground", reference: "typeReference", both: "typeBoth" } as const;
const STATUS_KEYS = { pending: "statusPending", in_progress: "statusInProgress", completed: "statusCompleted" } as const;

/**
 * [LEGAL] UK GDPR Art 14: the employer is collecting information about the
 * candidate from other people (referees, past employers), so the candidate
 * sees that a check exists, what kind, and where it stands. The outcome and
 * the referees' answers stay with the employer.
 */
export function BackgroundCheckNotice({ checks, companyName }: { checks: BackgroundCheckItem[]; companyName: string }) {
  const t = useTranslations("applicationDetail.backgroundCheck");
  const locale = useLocale();
  const date = (iso: string) => formatApplicationDate(iso, locale, { withYear: true });

  return (
    <section className="card-base space-y-3 rounded-2xl border panel-body" aria-labelledby="background-check-heading">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h2 id="background-check-heading" className="text-sm font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("explanation", { companyName })}</p>
        </div>
      </div>
      <ul className="space-y-2 sm:ps-8">
        {checks.map((check) => (
          <li key={check._id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{t(TYPE_KEYS[check.checkType] ?? "typeBackground")}</span>
            <span className="text-muted-foreground">{t("started", { date: date(check.createdAt) })}</span>
            <Badge variant={check.status === "completed" ? "default" : "secondary"}>
              {t(STATUS_KEYS[check.status] ?? "statusPending")}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground sm:ps-8">
        {t.rich("questions", {
          link: (chunks) => (
            <Link href={`/${locale}/job-seeker/settings/privacy`} className="font-medium text-primary underline-offset-4 hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
