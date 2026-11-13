"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Gauge, Info, Sparkles, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { RequirementReport, reportGaps } from "@/components/features/matching/RequirementReport";
import type { RequirementReport as Report } from "@/lib/matching/requirementReport";
import { formatCount } from "@/lib/ui/intlFormat";

interface JobMatch {
  score: number | null;
  eligible?: boolean;
  reason?: string;
  parts?: Partial<Record<Part, number | null>>;
  /** Each part's share of this job's score, in percent. */
  shares?: Partial<Record<Part, number>>;
  report?: Report;
  mustHaveStatus?: "met" | "unverified" | "not_met";
  aiAdjustment?: number;
  skillsUnknown?: boolean;
}

const PARTS = ["skills", "role", "experience", "education", "credentials", "languages"] as const;
type Part = (typeof PARTS)[number];

/**
 * "Your match" on the job page: the job list's percentage for this job and
 * what it is made of. QA 2026-10-06: the list said 93% and the job page said
 * nothing, so nobody could tell what the number meant.
 */
/** The employer's skill lists, as stored on the job. */
interface AskedSkills {
  skills: string[];
  preferredSkills: string[];
}

/**
 * The job's skills as plain chips, for a seeker with no score yet (or a score
 * without a report). With a report, each skill is listed there with Has /
 * Missing; the job page used to print the same list twice more beside it.
 */
function AskedSkillsCard({ asked, bare = false }: { asked: AskedSkills; bare?: boolean }) {
  const t = useTranslations("jobSeekerJobDetail");
  if (asked.skills.length === 0 && asked.preferredSkills.length === 0) return null;
  const group = (label: string, skills: string[], dashed: boolean) =>
    skills.length > 0 && (
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span
              key={s}
              className={`rounded-full border border-border/60 px-3 py-1 text-sm text-muted-foreground ${dashed ? "border-dashed" : "bg-muted/20"}`}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  const groups = (
    <div className="space-y-4">
      {group(t("skills"), asked.skills, false)}
      {group(t("niceToHave"), asked.preferredSkills, true)}
    </div>
  );
  if (bare) {
    return (
      <div>
        <p className="mb-3 text-sm font-medium text-foreground">{t("match.askedTitle")}</p>
        {groups}
      </div>
    );
  }
  return (
    <section className="card-base rounded-xl sm:rounded-3xl panel-body">
      <h2 className="heading-section mb-4 font-semibold tracking-tight text-foreground">{t("match.askedTitle")}</h2>
      {groups}
    </section>
  );
}

export function JobMatchCard({ jobId, asked }: { jobId: string; asked?: AskedSkills }) {
  const t = useTranslations("jobSeekerJobDetail.match");
  const locale = useLocale();
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  if (!data || data.score === null || !data.parts) return asked ? <AskedSkillsCard asked={asked} /> : null;
  const report = data.report && data.report.items.length > 0 ? data.report : undefined;
  const gapCount = report ? reportGaps(report).length : 0;

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
    <section id="job-match" className="card-base scroll-mt-20 rounded-xl sm:rounded-3xl panel-body" aria-labelledby="job-match-heading">
      <div className="flex items-center gap-2">
        <Gauge className="size-4 text-primary" aria-hidden="true" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</div>
      </div>
      <h2 id="job-match-heading" className="heading-section mt-1 font-semibold tracking-tight text-foreground">
        {t("score", { score: formatCount(data.score, undefined, locale) })}
      </h2>

      {/* What the seeker can act on: the verdict, then only what is not
          fully met. A 95% match used to print eleven "You have this" rows
          and the scoring weights before anything useful (owner, 2026-11-13). */}
      {report && (
        <div className="mt-3">
          <RequirementReport report={report} audience="seeker" rows="gaps" />
          {gapCount === 0 && <p className="mt-2 text-sm text-muted-foreground">{t("noGaps")}</p>}
          {data.mustHaveStatus && data.mustHaveStatus !== "met" && (
            <p className="mt-3 text-xs text-muted-foreground">{t("mustHaveNote")}</p>
          )}
        </div>
      )}
      {!report && asked && (
        <div className="mt-4">
          <AskedSkillsCard asked={asked} bare />
        </div>
      )}
      {data.eligible === false && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("notRecommended", { reason: reasonText(data.reason) })}
        </p>
      )}

      {/* The full working — each part's mark and every requirement — stays
          one tap away for whoever wants it. */}
      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
        aria-controls="job-match-details"
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
      >
        {t("howItWorks")}
        <ChevronDown className={`size-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {detailsOpen && (
        <div id="job-match-details" className="mt-2 border-t border-border/60 pt-4">
          <dl className="space-y-3">
            {PARTS.filter((part) => data.shares?.[part] !== undefined).map((part) => {
              const value = Math.round(data.parts?.[part] ?? 0);
              return (
                <div key={part}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="text-foreground">{t(part)}</dt>
                    <dd className="tabular-nums font-medium text-foreground">{formatCount(value, undefined, locale)}%</dd>
                  </div>
                  <Progress value={value} className="mt-1.5 h-1.5" aria-label={t(part)} />
                </div>
              );
            })}
          </dl>

          {report && (
            <div className="mt-5">
              <p className="mb-3 text-sm font-medium text-foreground">{t("requirementsHeading")}</p>
              <RequirementReport report={report} audience="seeker" summary={false} />
            </div>
          )}

          {ai !== 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
              {ai > 0 ? t("aiUp", { points: ai }) : t("aiDown", { points: Math.abs(ai) })}
            </p>
          )}
          {data.skillsUnknown && (
            <p className="mt-2 text-xs text-muted-foreground">{t("skillsUnknown")}</p>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t("gatesNote")}
          </p>
        </div>
      )}
    </section>
  );
}
