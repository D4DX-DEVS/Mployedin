"use client";

import { useMemo } from "react";
import { Check, Lightbulb, ChevronDown } from "lucide-react";
import { useSkillGaps } from "@/hooks/useSkillConfirmations";
import { SkillQuestion } from "./SkillQuestion";

interface SkillInsightsProps {
  jobId: string;
  source?: "job_view" | "feed" | "recommendation";
}

export function SkillInsights({ jobId, source = "job_view" }: SkillInsightsProps) {
  const { data, isLoading } = useSkillGaps(jobId);

  const allDisplaySkills = useMemo(() => {
    if (!data) return [];
    return [
      ...data.matchedSkills.map((s) => ({ skill: s, state: "matched" as const })),
      ...data.confirmedSkills.map((s) => ({ skill: s, state: "confirmed" as const })),
      ...data.unansweredSkills.map((s) => ({ skill: s, state: "unanswered" as const })),
    ];
  }, [data]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3 rounded-[28px] border border-border/60 bg-card p-6">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-3 w-48 rounded bg-muted" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.totalJobSkills === 0) return null;

  const hasUnanswered = data.unansweredSkills.length > 0;
  const matchCount = data.matchedSkills.length + data.confirmedSkills.length;

  return (
    <section className="card-base rounded-[28px] p-6">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Profile insights
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Here&apos;s how the job qualifications align with your profile.
      </p>

      {/* Match summary */}
      {matchCount > 0 && (
        <p className="mt-3 text-xs font-medium text-emerald-600">
          {matchCount} of {data.totalJobSkills} skills matched
        </p>
      )}

      {/* Skills */}
      <div className="mt-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Lightbulb className="h-3.5 w-3.5 text-muted-foreground/60" />
          Skills
        </p>
        <div className="flex flex-wrap gap-2">
          {allDisplaySkills.map(({ skill, state }) => (
            <SkillBadge key={skill} skill={skill} state={state} />
          ))}
          {data.deniedSkills.length > 0 && (
            <details className="inline">
              <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">
                <span className="inline-flex items-center gap-0.5">
                  <ChevronDown className="h-3 w-3" />
                  + show more
                </span>
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.deniedSkills.map((s) => (
                  <SkillBadge key={s} skill={s} state="denied" />
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Micro question for the first unanswered skill */}
      {hasUnanswered && (
        <div className="mt-4 border-t border-border/40 pt-4">
          <SkillQuestion
            jobId={jobId}
            unansweredSkills={data.unansweredSkills}
            source={source}
          />
        </div>
      )}
    </section>
  );
}

// ── Skill Badge ─────────────────────────────────────────────────────

interface SkillBadgeProps {
  skill: string;
  state: "matched" | "confirmed" | "unanswered" | "denied";
}

function SkillBadge({ skill, state }: SkillBadgeProps) {
  const styles = {
    matched:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    confirmed:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    unanswered:
      "border-border/60 bg-muted/20 text-muted-foreground",
    denied:
      "border-border/40 bg-muted/10 text-muted-foreground/50 line-through",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${styles[state]}`}
    >
      {(state === "matched" || state === "confirmed") && (
        <Check className="h-3 w-3" />
      )}
      {skill}
    </span>
  );
}
