"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlignLeft, Award, BadgeCheck, Briefcase, CalendarDays, Contact, Download, Eye, FileText, Globe,
  GraduationCap, Loader2, Mail, MapPin, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatListDate } from "@/lib/ui/intlFormat";

export interface ExpandedSeeker {
  _id: string;
  fullName?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  currentLocation?: string;
  summary?: string;
  skills?: string[];
  education?: { degree?: string; institution?: string; field?: string; startYear?: string; passingYear?: string }[];
  experience?: { jobTitle?: string; company?: string; location?: string; isCurrent?: boolean; startDate?: string; endDate?: string }[];
  languages?: { language?: string; proficiency?: string }[];
  certifications?: string[];
  availabilityStatus?: string;
  preferredJobType?: string;
  preferredLocations?: string[];
  cv?: { originalUrl?: string };
  userId?: { name?: string; email?: string };
  createdAt: string;
}

interface JobSeekerExpandedRowProps {
  seeker: ExpandedSeeker;
  locale: string;
  availabilityLabel?: string;
  onViewCv: () => void;
}

/** Items shown before "Show all": enough to judge a profile at a glance. */
const EXPERIENCE_SHOWN = 3;
const CHIPS_SHOWN = 12;

/** "Mar 2021" from a stored date string; unparseable text is shown as typed. */
function monthYear(value: string | undefined, locale: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(date);
}

const extFromType = (ct: string | null): string =>
  ct?.includes("wordprocessingml") ? "docx" : ct?.includes("msword") ? "doc" : ct?.includes("png") ? "png" : ct?.includes("jpeg") ? "jpg" : "pdf";

function Section({ icon: Icon, title, children, className }: { icon: typeof Contact; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`w-full min-w-0 rounded-xl border border-border bg-card p-4 ${className ?? ""}`}>
      <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </h4>
      {children}
    </section>
  );
}

function Chips({ items, more, onMore }: { items: string[]; more: number; onMore?: () => void }) {
  const t = useTranslations("adminJobSeekers");
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground/80">
          {item}
        </span>
      ))}
      {more > 0 && onMore && (
        <button
          type="button"
          onClick={onMore}
          className="rounded-full px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {t("expandedMoreSkills", { count: more })}
        </button>
      )}
    </div>
  );
}

/**
 * The detail under an expanded job-seeker row: who they are and how to reach
 * them on the left (with the CV), what they have done on the right. Replaces a
 * fixed three-column grid that left large holes beside short sections.
 */
export function JobSeekerExpandedRow({ seeker, locale, availabilityLabel, onViewCv }: JobSeekerExpandedRowProps) {
  const t = useTranslations("adminJobSeekers");
  const [allExperience, setAllExperience] = useState(false);
  const [allSkills, setAllSkills] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const name = seeker.fullName || seeker.userId?.name || "CV";
  const email = seeker.email ?? seeker.userId?.email;
  const experience = seeker.experience ?? [];
  const shownExperience = allExperience ? experience : experience.slice(0, EXPERIENCE_SHOWN);
  const skills = seeker.skills ?? [];
  const shownSkills = allSkills ? skills : skills.slice(0, CHIPS_SHOWN);
  const languages = (seeker.languages ?? []).map((l) => (l.proficiency ? `${l.language} · ${l.proficiency}` : l.language ?? "")).filter(Boolean);
  const certifications = seeker.certifications ?? [];

  // The CV route serves files inline (for the viewer), so a plain link would
  // only open it; fetch it and save it under the candidate's name instead.
  const downloadCv = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/employers/candidates/${seeker._id}/cv`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "CV"}-CV.${extFromType(res.headers.get("content-type"))}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch {
      toast.error(t("cvsDownloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  const contactLine = (Icon: typeof Mail, value?: string) =>
    value ? (
      <li className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 break-words">{value}</span>
      </li>
    ) : null;

  return (
    // text-start + full width: on phones the card table centres every
    // full-width cell (meant for empty states, globals.css), which this is not.
    <div className="grid w-full min-w-0 gap-4 text-start lg:grid-cols-[minmax(15rem,18rem)_1fr]">
      {/* ── Who and how to reach them ── */}
      <div className="w-full min-w-0 space-y-4">
        <Section icon={Contact} title={t("expandedLabelContact")}>
          <ul className="space-y-2 text-sm text-foreground/90">
            {contactLine(Mail, email)}
            {contactLine(Phone, seeker.phone)}
            {contactLine(MapPin, seeker.currentLocation)}
            {contactLine(Globe, seeker.nationality ? `${t("tableHeaderNationality")}: ${seeker.nationality}` : undefined)}
            {contactLine(CalendarDays, `${t("tableHeaderJoined")}: ${formatListDate(new Date(seeker.createdAt), locale)}`)}
          </ul>
          {(availabilityLabel || seeker.preferredJobType || seeker.preferredLocations?.length) && (
            <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
              {availabilityLabel && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("tableHeaderAvailability")}</dt>
                  <dd className="text-end font-medium text-foreground">{availabilityLabel}</dd>
                </div>
              )}
              {seeker.preferredJobType && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("exportHeaderJobTypePreference")}</dt>
                  <dd className="text-end font-medium capitalize text-foreground">{seeker.preferredJobType}</dd>
                </div>
              )}
              {seeker.preferredLocations?.length ? (
                <div className="flex justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">{t("exportHeaderPreferredLocations")}</dt>
                  <dd className="text-end font-medium text-foreground">{seeker.preferredLocations.join(", ")}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </Section>

        <Section icon={FileText} title={t("expandedLabelCvResume")}>
          {seeker.cv?.originalUrl ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={onViewCv} className="min-h-11 flex-1 gap-1.5 sm:min-h-9">
                <Eye className="size-4" aria-hidden="true" />
                {t("viewCvTitle")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void downloadCv()} disabled={downloading} className="min-h-11 flex-1 gap-1.5 sm:min-h-9">
                {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                {t("downloadCvLink")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("expandedNoCv")}</p>
          )}
        </Section>
      </div>

      {/* ── What they have done ── */}
      <div className="w-full min-w-0 space-y-4">
        {seeker.summary && (
          <Section icon={AlignLeft} title={t("expandedLabelSummary")}>
            <p className="text-sm leading-relaxed text-foreground/85">{seeker.summary}</p>
          </Section>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <Section icon={Briefcase} title={t("expandedLabelExperience")}>
            {experience.length ? (
              <>
                <ol className="relative space-y-3 border-s border-border ps-4">
                  {shownExperience.map((exp, i) => {
                    const from = monthYear(exp.startDate, locale);
                    const to = exp.isCurrent ? t("expandedPresent") : monthYear(exp.endDate, locale);
                    return (
                      <li key={i} className="relative">
                        <span
                          className={`absolute -start-[1.3rem] top-1.5 size-2.5 rounded-full border-2 border-card ${exp.isCurrent ? "bg-primary" : "bg-muted-foreground/40"}`}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-medium text-foreground">{exp.jobTitle || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {[exp.company, exp.location].filter(Boolean).join(" · ")}
                        </p>
                        {(from || to) && (
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{[from, to].filter(Boolean).join(" – ")}</span>
                            {exp.isCurrent && (
                              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">{t("experienceCurrent")}</span>
                            )}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {experience.length > EXPERIENCE_SHOWN && (
                  <button
                    type="button"
                    onClick={() => setAllExperience((v) => !v)}
                    className="mt-3 text-xs font-medium text-primary hover:underline"
                  >
                    {allExperience ? t("expandedShowFewer") : t("expandedShowAll", { count: experience.length })}
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("expandedNoExperience")}</p>
            )}
          </Section>

          <Section icon={GraduationCap} title={t("expandedLabelEducation")}>
            {seeker.education?.length ? (
              <ul className="space-y-3">
                {seeker.education.map((edu, i) => (
                  <li key={i}>
                    <p className="text-sm font-medium text-foreground">
                      {edu.degree || "—"}{edu.field ? ` — ${edu.field}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[edu.institution, edu.passingYear].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("expandedNoEducation")}</p>
            )}
          </Section>
        </div>

        {(skills.length > 0 || languages.length > 0 || certifications.length > 0) && (
          <Section icon={Award} title={t("expandedLabelSkills")}>
            <div className="space-y-3">
              {skills.length > 0 && (
                <Chips
                  items={shownSkills}
                  more={skills.length - shownSkills.length}
                  onMore={() => setAllSkills(true)}
                />
              )}
              {languages.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Globe className="size-3" aria-hidden="true" /> {t("expandedLabelLanguages")}
                  </p>
                  <Chips items={languages} more={0} />
                </div>
              )}
              {certifications.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <BadgeCheck className="size-3" aria-hidden="true" /> {t("expandedLabelCertifications")}
                  </p>
                  <Chips items={certifications} more={0} />
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
