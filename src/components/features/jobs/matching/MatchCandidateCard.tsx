"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Check, CircleAlert, Eye, ListChecks, MapPin, Send } from "lucide-react";
import { QualificationLineList } from "./QualificationLineList";
import { RequirementsChecklist } from "@/components/features/employer/applications/RequirementsChecklist";
import { RequirementReport } from "@/components/features/matching/RequirementReport";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import type { MatchingCandidate } from "@/hooks/useJobMatchingCandidates";

const MAX_SKILLS = 6;

interface MatchCandidateCardProps {
  candidate: MatchingCandidate;
  rank: number;
  canInvite: boolean;
  onInvite: () => void;
  /**
   * Super agents: open the full profile. Offered only when the server said the
   * candidate is in their team or territory (`canViewProfile`).
   */
  onViewProfile?: () => void;
}

function scoreTone(score: number): string {
  if (score >= 80) return "text-status-selected";
  if (score >= 60) return "text-status-shortlisted";
  return "text-muted-foreground";
}

/** One ranked candidate: who they are, the score and what it is made of, and the invite action. */
export function MatchCandidateCard({ candidate, rank, canInvite, onInvite, onViewProfile }: MatchCandidateCardProps) {
  const t = useTranslations("agentJobMatches");
  const { breakdown } = candidate;
  // The full match opens in a side panel: expanding inline stretched the
  // card's row neighbours in the grid into tall empty cards (owner, 2026-11-12).
  const [open, setOpen] = useState(false);
  const hasDetails =
    (candidate.qualifications?.length ?? 0) > 0 ||
    (candidate.lineChecks?.length ?? 0) > 0 ||
    (candidate.requirementReport?.items.length ?? 0) > 0 ||
    candidate.matchedSkills.length > 0 ||
    candidate.missingSkills.length > 0;
  // The report reads the job's education, experience, licence and language
  // lines itself; the older line-by-line list stays for rankings cached
  // before it existed.
  const report = candidate.requirementReport?.items.length ? candidate.requirementReport : null;

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
    <article className="card-base flex h-full flex-col gap-3 p-4 sm:gap-4 sm:p-5" aria-label={t("cardLabel", { rank, name: candidate.name })}>
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
              {/* The years the score used; "not stated" only when the profile
                  says nothing about experience at all. */}
              {candidate.totalExperienceYears
                ? t("yearsExperience", { count: candidate.totalExperienceYears })
                : candidate.experienceKnown
                  ? t("noExperienceYet")
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

      {hasDetails && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
          >
            <ListChecks className="size-4" aria-hidden />
            {t("showDetails")}
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-xl">
              <DialogHeader className="space-y-0.5 border-b px-5 py-4 pe-16 text-start">
                <DialogTitle className="break-words">{candidate.name}</DialogTitle>
                <DialogDescription>
                  <span className={cn("font-semibold tabular-nums", scoreTone(candidate.score))}>{candidate.score}%</span>{" "}
                  {t("scoreLabel")}
                  {subtitle ? ` · ${subtitle}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {report ? (
                  <>
                    <RequirementReport report={report} audience="employer" />
                    {/* Location, pay, work mode, screening, CV: the last group of
                        the same report, not a second "Requirements" box. */}
                    <RequirementsChecklist checks={candidate.qualifications} status={candidate.requirementsStatus} coveredByReport />
                  </>
                ) : (
                  <>
                    <RequirementsChecklist
                      checks={candidate.qualifications}
                      status={candidate.requirementsStatus}
                      matchedSkills={candidate.matchedSkills}
                      missingSkills={candidate.missingSkills}
                    />
                    {candidate.lineChecks && candidate.lineChecks.length > 0 && (
                      <QualificationLineList checks={candidate.lineChecks} />
                    )}
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
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

      {/* No footer at all when there is nothing to press (job not published,
          no profile access): a disabled Invite on every card said nothing. */}
      {(canInvite || candidate.invited || onViewProfile) && (
      <div className="mt-auto flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-end">
        {onViewProfile && candidate.canViewProfile ? (
          <Button
            type="button"
            variant="outline"
            onClick={onViewProfile}
            className="min-h-11 gap-2 rounded-xl sm:min-h-9"
            aria-label={t("viewProfileAria", { name: candidate.name })}
          >
            <Eye className="h-4 w-4" aria-hidden />
            {t("viewProfile")}
          </Button>
        ) : onViewProfile ? (
          <span className="text-center text-xs text-muted-foreground sm:me-auto sm:text-start">{t("profileOutsideTerritory")}</span>
        ) : null}
        {candidate.invited ? (
          <span className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-medium text-status-selected sm:min-h-9">
            <Check className="h-4 w-4" aria-hidden />
            {t("invited")}
          </span>
        ) : canInvite ? (
          <Button
            type="button"
            onClick={onInvite}
            className="min-h-11 gap-2 rounded-xl sm:min-h-9"
            aria-label={t("inviteAria", { name: candidate.name })}
          >
            <Send className="h-4 w-4" aria-hidden />
            {t("invite")}
          </Button>
        ) : null}
      </div>
      )}
    </article>
  );
}
