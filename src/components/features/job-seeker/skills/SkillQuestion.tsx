"use client";

import { useState, useCallback } from "react";
import { useConfirmSkill } from "@/hooks/useSkillConfirmations";

interface SkillQuestionProps {
  jobId: string;
  unansweredSkills: string[];
  source?: "job_view" | "feed" | "recommendation" | "skills_coach";
}

export function SkillQuestion({
  jobId,
  unansweredSkills,
  source = "job_view",
}: SkillQuestionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const confirmMutation = useConfirmSkill();

  const currentSkill = unansweredSkills[currentIndex];

  const handleAnswer = useCallback(
    (status: "confirmed" | "denied" | "skipped") => {
      if (!currentSkill) return;

      confirmMutation.mutate(
        { skill: currentSkill, status, source, jobId },
        {
          onSuccess: () => {
            setAnsweredCount((c) => c + 1);
            setCurrentIndex((i) => i + 1);
          },
        },
      );
    },
    [currentSkill, confirmMutation, source, jobId],
  );

  // All answered
  if (!currentSkill || currentIndex >= unansweredSkills.length) {
    if (answeredCount === 0) return null;
    return (
      <p className="text-xs font-medium text-emerald-600">
        Thanks! Your profile has been updated with {answeredCount} skill{answeredCount !== 1 ? "s" : ""}.
      </p>
    );
  }

  const remaining = unansweredSkills.length - currentIndex;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Do you have experience in{" "}
        <span className="font-semibold text-foreground">{currentSkill}</span>?
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleAnswer("confirmed")}
          disabled={confirmMutation.isPending}
          className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
        >
          Yes
        </button>
        <button
          onClick={() => handleAnswer("denied")}
          disabled={confirmMutation.isPending}
          className="inline-flex items-center rounded-xl border border-border bg-secondary/80 px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          No
        </button>
        <button
          onClick={() => handleAnswer("skipped")}
          disabled={confirmMutation.isPending}
          className="inline-flex items-center rounded-xl border border-border bg-secondary/80 px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          Skip
        </button>
      </div>

      {remaining > 1 && (
        <p className="text-[11px] text-muted-foreground/70">
          {remaining - 1} more skill question{remaining - 1 !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
