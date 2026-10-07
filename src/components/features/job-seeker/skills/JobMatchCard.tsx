"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Gauge, Info, Sparkles, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { RELEVANCE_WEIGHTS } from "@/lib/matching/constants";
import { formatCount } from "@/lib/ui/intlFormat";

interface JobMatch {
  score: number | null;
  eligible?: boolean;
  reason?: string;
  parts?: { skills: number; role: number; experience: number };
  aiAdjustment?: number;
  skillsUnknown?: boolean;
}

const PARTS = ["skills", "role", "experience"] as const;

/**
 * "Your match" on the job page: the job list's percentage for this job and
 * what it is made of. QA 2026-10-06: the list said 93% and the job page said
 * nothing, so nobody could tell what the number meant.
 */
export function JobMatchCard({ jobId }: { jobId: string }) {
  const t = useTranslations("jobSeekerJobDetail.match");
  const locale = useLocale();
  const { data, isLoading, isError } = useQuery<JobMatch>({
    queryKey: ["job-seeker-match", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/job-seeker/match?jobId=${encodeURIComponent(jobId)}`);
      if (!res.ok) throw new Error(`match ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3 rounded-xl sm:rounded-3xl border border-border/60 bg-card panel-body" aria-hidden="true">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-7 w-32 rounded bg-muted" />
        {PARTS.map((p) => <div key={p} className="h-2 w-full rounded bg-muted" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <section className="card-base rounded-xl sm:rounded-3xl panel-body">
        <p className="text-sm text-muted-foreground">{t("error")}</p>
      </section>
    );
  }

  if (!data || data.score === null || !data.parts) return null;

  const reasonText = (reason?: string): string => {
    switch (reason) {
      case "country": return t("reasons.country");
      case "work_mode": return t("reasons.work_mode");
      case "salary": return t("reasons.salary");
      case "experience": return t("reasons.experience");
      case "education": return t("reasons.education");
      case "experience_unknown": return t("reasons.experience_unknown");
      case "education_unknown": return t("reasons.education_unknown");
      default: return t("reasons.other");
    }
  };

  const ai = data.aiAdjustment ?? 0;

  return (
    <section className="card-base rounded-xl sm:rounded-3xl panel-body" aria-labelledby="job-match-heading">
      <div className="flex items-center gap-2">
        <Gauge className="size-4 text-primary" aria-hidden="true" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</div>
      </div>
      <h2 id="job-match-heading" className="heading-section mt-1 font-semibold tracking-tight text-foreground">
        {t("score", { score: formatCount(data.score, undefined, locale) })}
      </h2>

      <p className="mt-4 text-sm font-medium text-foreground">{t("howItWorks")}</p>
      <dl className="mt-2 space-y-3">
        {PARTS.map((part) => {
          const value = Math.round(data.parts![part]);
          return (
            <div key={part}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-foreground">
                  {t(part)}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {t("weight", { weight: Math.round(RELEVANCE_WEIGHTS[part] * 100) })}
                  </span>
                </dt>
                <dd className="tabular-nums font-medium text-foreground">{formatCount(value, undefined, locale)}%</dd>
              </div>
              <Progress value={value} className="mt-1.5 h-1.5" aria-label={t(part)} />
            </div>
          );
        })}
      </dl>

      {ai !== 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
          {ai > 0 ? t("aiUp", { points: ai }) : t("aiDown", { points: Math.abs(ai) })}
        </p>
      )}
      {data.skillsUnknown && (
        <p className="mt-2 text-xs text-muted-foreground">{t("skillsUnknown")}</p>
      )}
      {data.eligible === false && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("notRecommended", { reason: reasonText(data.reason) })}
        </p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t("gatesNote")}
      </p>
    </section>
  );
}
