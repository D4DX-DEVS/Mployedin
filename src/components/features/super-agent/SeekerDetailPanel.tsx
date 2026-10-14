"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Clock,
  Crown,
  FileText,
  Flag,
  Globe2,
  GraduationCap,
  Languages as LanguagesIcon,
  Laptop,
  Mail,
  MapPin,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import type { ReferralSummary } from "@/lib/referrals/summary";
import { formatDate, formatListDate } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";

interface DetailLanguage {
  language: string;
  proficiency?: string;
}

interface DetailEducation {
  degree: string;
  institution: string;
  field?: string;
  graduationDate?: string;
}

interface DetailExperience {
  jobTitle: string;
  company: string;
  isCurrent?: boolean;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface SeekerProfile {
  _id: string;
  userId?: { name?: string; email?: string };
  headline?: string;
  summary?: string;
  currentLocation?: string;
  country?: string;
  nationality?: string;
  skills?: string[];
  experience?: DetailExperience[];
  education?: DetailEducation[];
  languages?: DetailLanguage[];
  certifications?: string[];
  profileCompleteness?: number;
  totalExperienceYears?: number;
  availabilityStatus?: string;
  noticePeriod?: number;
  preferredJobType?: string;
  preferredLocations?: string[];
  preferredCountries?: string[];
  badges?: string[];
  cv?: { originalUrl?: string };
  documents?: Array<{ category?: string; url?: string }>;
  createdAt: string;
  updatedAt?: string;
}

/** What the list row already knows about the seeker's place in the team. */
export interface SeekerTeamContext {
  referralSummary?: ReferralSummary;
  agent?: { name: string; via: "added" | "assigned" };
  inArea?: boolean;
}

interface SeekerDetailPanelProps {
  seekerId: string | null;
  context?: SeekerTeamContext;
  /** Open the CV. The page shows the viewer with this panel hidden: inside
   *  the panel's modal dialog the viewer could not be clicked or focused. */
  onViewCv: (seeker: { id: string; name: string }) => void;
}

const AVAILABILITY_KEYS: Record<string, string> = {
  immediately: "availableImmediately",
  within_month: "availableWithinMonth",
  within_3_months: "availableWithin3Months",
  not_available: "notAvailable",
};

const AVAILABILITY_TONE: Record<string, string> = {
  immediately: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  within_month: "bg-sky-50 text-sky-700 ring-sky-200",
  within_3_months: "bg-amber-50 text-amber-800 ring-amber-200",
  not_available: "bg-muted text-muted-foreground ring-border",
};

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * A job seeker's profile for the super agent, read-only: who on the team
 * brought them in, how complete the profile is and what is missing, the facts
 * a placement turns on, then the profile itself and the CV (client feedback
 * 2026-10-14: the super agent could not open a seeker's details or CV).
 */
export function SeekerDetailPanel({ seekerId, context, onViewCv }: SeekerDetailPanelProps) {
  const t = useTranslations("superAgentJobSeekers");
  const locale = useLocale();
  const [seeker, setSeeker] = useState<SeekerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!seekerId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/job-seekers/${seekerId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 404 || res.status === 403 ? t("notFound") : t("failedToLoadProfile"));
          return;
        }
        const data = await res.json();
        if (!cancelled) setSeeker(data.jobSeeker);
      })
      .catch(() => { if (!cancelled) setError(t("failedToLoadProfile")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [seekerId, t, attempt]);

  if (!seekerId) return null;

  if (loading || (!seeker && !error)) {
    return (
      <div className="space-y-4 p-5" aria-busy="true">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !seeker) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
        <p className="mt-2 text-sm text-muted-foreground">{error || t("failedToLoadProfile")}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
          {t("detail.retry")}
        </Button>
      </div>
    );
  }

  const name = seeker.userId?.name ?? t("detail.unnamed");
  const email = seeker.userId?.email ?? "";
  const hasCv = Boolean(seeker.cv?.originalUrl || seeker.documents?.some((d) => d.category === "resume" && d.url));
  const current = seeker.experience?.find((e) => e.isCurrent) ?? seeker.experience?.[0];
  const role = seeker.headline || current?.jobTitle;
  const isPremium = (seeker.badges ?? []).includes("premium");
  const location = [seeker.currentLocation, seeker.country].filter(Boolean).join(", ");
  const completeness = Math.max(0, Math.min(100, Math.round(seeker.profileCompleteness ?? 0)));
  const availabilityKey = seeker.availabilityStatus ? AVAILABILITY_KEYS[seeker.availabilityStatus] : undefined;
  const preferred = [...(seeker.preferredLocations ?? []), ...(seeker.preferredCountries ?? [])];
  const monthYear = (value?: string) => (value ? formatDate(value, { month: "short", year: "numeric" }, locale) : "");

  // What the profile still lacks — what the super agent asks the agent to chase.
  const missing = [
    !hasCv && t("detail.missing.cv"),
    !seeker.summary && t("detail.missing.summary"),
    !(seeker.skills?.length) && t("detail.missing.skills"),
    !(seeker.experience?.length) && t("detail.missing.experience"),
    !(seeker.education?.length) && t("detail.missing.education"),
    !(seeker.languages?.length) && t("detail.missing.languages"),
  ].filter(Boolean) as string[];

  const facts: { icon: typeof Briefcase; label: string; value?: string }[] = [
    {
      icon: Briefcase,
      label: t("detail.facts.experience"),
      value: seeker.totalExperienceYears != null ? t("detail.facts.years", { count: seeker.totalExperienceYears }) : undefined,
    },
    { icon: Clock, label: t("detail.facts.noticePeriod"), value: seeker.noticePeriod != null ? t("detail.facts.days", { count: seeker.noticePeriod }) : undefined },
    {
      icon: Laptop,
      label: t("jobTypePreference"),
      value: seeker.preferredJobType ? t(`detail.jobType.${["remote", "hybrid", "onsite", "any"].includes(seeker.preferredJobType) ? seeker.preferredJobType : "any"}`) : undefined,
    },
    { icon: Globe2, label: t("preferredLocations"), value: preferred.length ? preferred.slice(0, 3).join(", ") + (preferred.length > 3 ? ` +${preferred.length - 3}` : "") : undefined },
    { icon: Flag, label: t("detail.facts.nationality"), value: seeker.nationality || undefined },
    { icon: CalendarDays, label: t("detail.facts.joined"), value: formatListDate(seeker.createdAt, locale) },
  ];

  return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header: who, what they do, who on the team owns them, and the CV. */}
        <header className="shrink-0 border-b border-border bg-gradient-to-br from-primary/[0.06] via-background to-background px-5 pb-4 pt-5 pe-14">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 shrink-0 ring-2 ring-background">
              <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 break-words text-lg font-semibold leading-6 text-foreground">{name}</h2>
                {isPremium && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    <Crown className="h-3 w-3" aria-hidden="true" />
                    {t("premium.chip")}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {role ? (
                  <>
                    <span className="font-medium text-foreground">{role}</span>
                    {current?.company && <span> · {current.company}</span>}
                  </>
                ) : (
                  t("detail.noRole")
                )}
              </p>
              {location && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{location}</span>
                </p>
              )}
            </div>
          </div>

          {(context?.referralSummary || context?.agent || context?.inArea || availabilityKey) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {availabilityKey && (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", AVAILABILITY_TONE[seeker.availabilityStatus!])}>
                  <CalendarClock className="h-3 w-3" aria-hidden="true" />
                  {t(availabilityKey)}
                </span>
              )}
              {context?.referralSummary ? (
                <ReferralSourceChip namespace="superAgentJobSeekers" summary={context.referralSummary} />
              ) : context?.agent ? (
                <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{context.agent.via === "added" ? t("byAgent.added", { name: context.agent.name }) : t("byAgent.assigned", { name: context.agent.name })}</span>
                </span>
              ) : null}
              {context?.inArea && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" title={t("area.chipHint")}>
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {t("area.chip")}
                </span>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Owner, 2026-10-14: the super agent sees the CV with the profile;
                the CV route applies the same scope as this profile. */}
            {hasCv ? (
              <Button size="sm" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => onViewCv({ id: seeker._id, name })}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t("viewCv")}
              </Button>
            ) : (
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {t("detail.noCv")}
              </span>
            )}
            {email && (
              <Button asChild size="sm" variant="outline" className="min-h-11 min-w-0 gap-1.5 sm:min-h-9">
                <a href={`mailto:${email}`} title={email}>
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{email}</span>
                </a>
              </Button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Completeness, with what is missing named. */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">{t("profile")}</h3>
              <span className="text-sm font-semibold tabular-nums text-foreground">{completeness}%</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={completeness}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("profile")}
            >
              <div
                className={cn("h-full rounded-full", completeness >= 80 ? "bg-emerald-500" : completeness >= 50 ? "bg-primary" : "bg-amber-500")}
                style={{ width: `${completeness}%` }}
              />
            </div>
            {missing.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("detail.missingLine", { items: missing.join(", ") })}</p>
            ) : (
              <p className="mt-2 text-xs text-emerald-700">{t("detail.completeLine")}</p>
            )}
          </section>

          {/* The facts a placement turns on; a gap says so instead of vanishing. */}
          <section aria-labelledby="seeker-facts">
            <h3 id="seeker-facts" className="mb-2 text-sm font-semibold text-foreground">{t("quickFacts")}</h3>
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="flex items-start gap-3 bg-card p-3">
                  <fact.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                    <dd className={cn("mt-0.5 break-words text-sm", fact.value ? "font-medium text-foreground" : "text-muted-foreground/70")}>
                      {fact.value ?? t("detail.notProvided")}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </section>

          {seeker.summary && (
            <Block title={t("summary")}>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{seeker.summary}</p>
            </Block>
          )}

          {(seeker.skills?.length ?? 0) > 0 && (
            <Block title={t("skills")}>
              <div className="flex flex-wrap gap-1.5">
                {seeker.skills!.map((skill) => (
                  <span key={skill} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{skill}</span>
                ))}
              </div>
            </Block>
          )}

          {(seeker.experience?.length ?? 0) > 0 && (
            <Block title={t("experience")} icon={Briefcase}>
              <ol className="relative space-y-4 border-s border-border ps-5">
                {seeker.experience!.map((exp, idx) => {
                  const dates = [monthYear(exp.startDate), exp.isCurrent ? t("detail.present") : monthYear(exp.endDate)].filter(Boolean).join(" – ");
                  return (
                    <li key={idx} className="relative">
                      <span
                        className={cn("absolute -start-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background", exp.isCurrent ? "bg-primary" : "bg-muted-foreground/40")}
                        aria-hidden="true"
                      />
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="font-medium text-foreground">{exp.jobTitle}</p>
                        {exp.isCurrent && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t("current")}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{[exp.company, dates].filter(Boolean).join(" · ")}</p>
                      {exp.description && <p className="mt-1.5 line-clamp-4 text-xs leading-5 text-muted-foreground">{exp.description}</p>}
                    </li>
                  );
                })}
              </ol>
            </Block>
          )}

          {(seeker.education?.length ?? 0) > 0 && (
            <Block title={t("education")} icon={GraduationCap}>
              <ul className="space-y-2.5">
                {seeker.education!.map((edu, idx) => (
                  <li key={idx}>
                    <p className="text-sm font-medium text-foreground">{[edu.degree, edu.field].filter(Boolean).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">{[edu.institution, monthYear(edu.graduationDate)].filter(Boolean).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {(seeker.languages?.length ?? 0) > 0 && (
            <Block title={t("languages")} icon={LanguagesIcon}>
              <div className="flex flex-wrap gap-2">
                {seeker.languages!.map((lang, idx) => (
                  <span key={idx} className="rounded-lg border border-border px-2.5 py-1 text-xs">
                    <span className="font-medium text-foreground">{lang.language}</span>
                    {lang.proficiency && <span className="text-muted-foreground"> · {lang.proficiency}</span>}
                  </span>
                ))}
              </div>
            </Block>
          )}

          {(seeker.certifications?.length ?? 0) > 0 && (
            <Block title={t("certifications")}>
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {seeker.certifications!.map((cert, idx) => <li key={idx}>{cert}</li>)}
              </ul>
            </Block>
          )}

          <CandidateDataNotice variant="staffDetail" />
        </div>
      </div>
  );
}

function Block({ title, icon: Icon, children }: { title: string; icon?: typeof Briefcase; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        {title}
      </h3>
      {children}
    </section>
  );
}
