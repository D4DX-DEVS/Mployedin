"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, Check } from "lucide-react";
import { useCompareApplications, type CompareCandidate } from "@/hooks/useApplications";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing, matchBandLabel } from "@/components/features/employer/candidates/ScoreRing";

export interface CompareCandidatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Two or three application ids; the API caps at three. */
  applicationIds: string[];
}

type Translator = ReturnType<typeof useTranslations>;

const BREAKDOWN_ROWS = [
  { key: "skills", labelKey: "breakdownSkills" },
  { key: "experience", labelKey: "breakdownExperience" },
  { key: "location", labelKey: "breakdownLocation" },
  { key: "salary", labelKey: "breakdownSalary" },
] as const;

function initials(name: string): string {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
  return letters ? letters.toUpperCase() : "?";
}

function columnsFor(count: number): string {
  return count <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

/**
 * Finalists side by side: score, breakdown, experience, skills (the ones every
 * candidate shares are marked), expected salary and profile completeness.
 * Fed by GET /api/applications/compare, which existed long before any screen
 * called it.
 */
export function CompareCandidatesDialog({ open, onOpenChange, applicationIds }: CompareCandidatesDialogProps) {
  const t = useTranslations("employerApplications");
  const tBand = useTranslations("employerCompliance.match");
  const { data, isLoading, isError } = useCompareApplications(applicationIds);

  const candidates = data?.candidates ?? [];
  const common = new Set((data?.commonSkills ?? []).map((skill) => skill.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("compareFinalists")}</DialogTitle>
          <DialogDescription>{t("compareDescription", { count: applicationIds.length })}</DialogDescription>
        </DialogHeader>

        {isError && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
            <p>{t("compareError")}</p>
          </div>
        )}

        {isLoading && (
          <div className={`grid gap-4 ${columnsFor(applicationIds.length)}`} aria-busy="true">
            {applicationIds.slice(0, 3).map((id) => (
              <div key={id} className="space-y-3 rounded-2xl border border-border p-4">
                <Skeleton className="mx-auto size-12 rounded-full" />
                <Skeleton className="mx-auto h-5 w-3/4" />
                <Skeleton className="mx-auto h-16 w-16 rounded-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && candidates.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("noCandidatesToCompare")}</p>
        )}

        {candidates.length > 0 && (
          <>
            <div className={`grid gap-4 ${columnsFor(candidates.length)}`}>
              {candidates.map((candidate) => (
                <CandidateColumn key={candidate.applicationId} row={candidate} common={common} t={t} tBand={tBand} />
              ))}
            </div>
            {common.size > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
                {t("commonSkillsIndicator")}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CandidateColumn({ row, common, t, tBand }: { row: CompareCandidate; common: Set<string>; t: Translator; tBand: Translator }) {
  const { candidate, matchBreakdown, aiMatchScore } = row;
  const band = matchBandLabel(aiMatchScore ?? undefined, tBand);
  const breakdownRows = BREAKDOWN_ROWS.filter((r) => matchBreakdown?.[r.key] != null);
  const completeness = Math.min(100, Math.max(0, Math.round(candidate.profileCompleteness)));

  return (
    <section aria-label={candidate.name} className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground" aria-hidden="true">
          {initials(candidate.name)}
        </div>
        <p className="line-clamp-2 font-semibold">{candidate.name}</p>
        <ScoreRing
          value={aiMatchScore ?? undefined}
          size={64}
          strokeWidth={5}
          label={t("aiMatch")}
          bandLabel={band}
          emptyLabel={t("notScoredYet")}
        />
      </div>

      {breakdownRows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-xs">
          {breakdownRows.map((r) => (
            <div key={r.key} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t(r.labelKey)}</dt>
              <dd className="font-semibold">{Math.round(matchBreakdown![r.key]!)}%</dd>
            </div>
          ))}
        </dl>
      )}

      <Fact label={t("yearsOfExperience")} value={`${candidate.yearsOfExperience} ${t("yearsAbbr")}`} />

      {candidate.skills.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{t("skills")}</p>
          <ul className="flex flex-wrap gap-1.5" aria-label={t("skills")}>
            {candidate.skills.map((skill) => {
              const shared = common.has(skill.toLowerCase());
              return (
                <li key={skill}>
                  <Badge
                    variant={shared ? "default" : "secondary"}
                    className={shared ? "rounded-full bg-emerald-100 text-emerald-900 hover:bg-emerald-100" : "rounded-full"}
                    data-shared={shared ? "true" : undefined}
                  >
                    {shared && <Check className="me-1 size-3" aria-hidden="true" />}
                    {skill}
                    {shared && <span className="sr-only"> ({t("sharedSkill")})</span>}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Fact
        label={t("expectedSalary")}
        value={
          candidate.preferredSalary
            ? `${candidate.preferredSalary.min.toLocaleString()}–${candidate.preferredSalary.max.toLocaleString()} ${candidate.preferredSalary.currency}`
            : t("notProvided")
        }
      />

      <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">{t("profileCompleteness")}</p>
        <div className="flex items-center gap-2">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={t("profileCompleteness")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completeness}
          >
            <div className="h-full bg-emerald-500" style={{ width: `${completeness}%` }} />
          </div>
          <span className="text-xs font-semibold">{completeness}%</span>
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
