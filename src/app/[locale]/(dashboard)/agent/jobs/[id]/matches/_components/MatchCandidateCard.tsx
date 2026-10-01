"use client";

import { useTranslations } from "next-intl";
import { Briefcase, Check, CircleAlert, MapPin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import type { MatchingCandidate } from "@/hooks/useJobMatchingCandidates";

const MAX_SKILLS = 6;

interface MatchCandidateCardProps {
  candidate: MatchingCandidate;
  rank: number;
  canInvite: boolean;
  onInvite: () => void;
}

function scoreTone(score: number): string {
  if (score >= 80) return "text-status-selected";
  if (score >= 60) return "text-status-shortlisted";
  return "text-muted-foreground";
}

/** One ranked candidate: who they are, the score and what it is made of, and the invite action. */
export function MatchCandidateCard({ candidate, rank, canInvite, onInvite }: MatchCandidateCardProps) {
  const t = useTranslations("agentJobMatches");
  const { breakdown } = candidate;

  // Literal keys only — a template-literal key escapes the missing-key checks.
  const parts: Array<{ label: string; value: number }> = [
    { label: t("parts.skills"), value: breakdown.skills },
    { label: t("parts.role"), value: breakdown.role },
    { label: t("parts.experience"), value: breakdown.experience },
    ...(breakdown.education !== undefined ? [{ label: t("parts.education"), value: breakdown.education }] : []),
    ...(breakdown.industry !== undefined ? [{ label: t("parts.industry"), value: breakdown.industry }] : []),
  ];

  const preference =
    candidate.preferenceMismatch === "country"
      ? t("preference.country")
      : candidate.preferenceMismatch === "work_mode"
        ? t("preference.workMode")
        : candidate.preferenceMismatch === "salary"
          ? t("preference.salary")
          : null;

  const requirementLabel = (key: string): string => {
    switch (key) {
      case "experience": return t("requirement.experience");
      case "education": return t("requirement.education");
      case "skills": return t("requirement.skills");
      case "languages": return t("requirement.languages");
      case "location": return t("requirement.location");
      case "work_mode": return t("requirement.workMode");
      case "salary": return t("requirement.salary");
      case "screening": return t("requirement.screening");
      default: return t("requirement.other");
    }
  };

  const subtitle =
    candidate.headline ||
    (candidate.latestRole?.title
      ? candidate.latestRole.company
        ? t("latestRole", { title: candidate.latestRole.title, company: candidate.latestRole.company })
        : candidate.latestRole.title
      : null);

  return (
    <article className="card-base flex flex-col gap-4 p-4 sm:p-5" aria-label={t("cardLabel", { rank, name: candidate.name })}>
      <div className="flex items-start gap-3">
        <UserAvatar name={candidate.name} src={candidate.avatar} className="h-11 w-11 shrink-0" colorful />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">{candidate.name}</h3>
          {subtitle && <p className="line-clamp-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {candidate.currentLocation && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{candidate.currentLocation}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {candidate.totalExperienceYears
                ? t("yearsExperience", { count: candidate.totalExperienceYears })
                : t("experienceNotStated")}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-end">
          <p className={cn("text-2xl font-bold leading-none tabular-nums", scoreTone(candidate.score))}>{candidate.score}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("scoreLabel")}</p>
        </div>
      </div>

      <dl className="flex flex-wrap gap-2" aria-label={t("breakdownLabel")}>
        {parts.map((part) => (
          <div key={part.label} className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-1 text-xs">
            <dt className="text-muted-foreground">{part.label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{part.value}%</dd>
          </div>
        ))}
      </dl>

      {(candidate.matchedSkills.length > 0 || candidate.missingSkills.length > 0) && (
        <div className="space-y-2 text-xs">
          {candidate.matchedSkills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 font-medium text-foreground">{t("hasSkills")}</span>
              {candidate.matchedSkills.slice(0, MAX_SKILLS).map((skill) => (
                <span key={skill} className="inline-flex items-center gap-1 rounded-full bg-status-selected-bg px-2 py-0.5 text-status-selected">
                  <Check className="h-3 w-3" aria-hidden />
                  {skill}
                </span>
              ))}
            </div>
          )}
          {candidate.missingSkills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 font-medium text-foreground">{t("missingSkills")}</span>
              {candidate.missingSkills.slice(0, MAX_SKILLS).map((skill) => (
                <span key={skill} className="rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {(preference || candidate.unmetRequirements.length > 0) && (
        <ul className="space-y-1 text-xs">
          {preference && (
            <li className="flex items-start gap-1.5 text-status-shortlisted">
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {preference}
            </li>
          )}
          {candidate.unmetRequirements.length > 0 && (
            <li className="flex items-start gap-1.5 text-status-shortlisted">
              <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("unmet", { list: [...new Set(candidate.unmetRequirements.map((r) => requirementLabel(r.key)))].join(", ") })}
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-end">
        {candidate.invited ? (
          <span className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-medium text-status-selected sm:min-h-9">
            <Check className="h-4 w-4" aria-hidden />
            {t("invited")}
          </span>
        ) : (
          <Button
            type="button"
            onClick={onInvite}
            disabled={!canInvite}
            className="min-h-11 gap-2 rounded-xl sm:min-h-9"
            aria-label={t("inviteAria", { name: candidate.name })}
          >
            <Send className="h-4 w-4" aria-hidden />
            {t("invite")}
          </Button>
        )}
      </div>
    </article>
  );
}
