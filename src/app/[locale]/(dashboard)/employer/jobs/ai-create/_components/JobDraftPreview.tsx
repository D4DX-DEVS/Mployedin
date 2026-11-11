"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatCount } from "@/lib/ui/intlFormat";
import { experienceRange, requirementsOf, type ExtractedJob } from "./extractedJob";

interface JobDraftPreviewProps {
  job: ExtractedJob;
  /** The draft was read from an uploaded poster: an empty field reads "Not on the poster". */
  fromPoster: boolean;
}

/** Longest list shown in full; the rest is counted ("+3 more"). */
const LIST_PREVIEW = 8;

const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <strong>{label}</strong> {children}
    </p>
  );
}

interface ItemListProps {
  label: string;
  items: string[] | undefined;
  missing: ReactNode;
  moreLabel: (count: number) => string;
}

function ItemList({ label, items, missing, moreLabel }: ItemListProps) {
  const list = (items ?? []).filter(Boolean);
  return (
    <div>
      <strong>{label}</strong>
      {list.length ? (
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          {list.slice(0, LIST_PREVIEW).map((item, i) => (
            <li key={i} className="text-muted-foreground">{item}</li>
          ))}
          {list.length > LIST_PREVIEW && (
            <li className="list-none italic text-muted-foreground">{moreLabel(list.length - LIST_PREVIEW)}</li>
          )}
        </ul>
      ) : (
        <p className="mt-0.5">{missing}</p>
      )}
    </div>
  );
}

function SkillChips({ label, items, missing }: { label: string; items: string[]; missing: ReactNode }) {
  return (
    <div>
      <strong>{label}</strong>
      {items.length ? (
        <ul className="mt-1 flex flex-wrap gap-1">
          {items.map((skill, i) => (
            <li key={i} className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{skill}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5">{missing}</p>
      )}
    </div>
  );
}

/**
 * Every field of the AI's draft, with the empty ones said out loud. The old
 * preview hid qualifications, experience, education and the description, so a
 * poster's missing qualification only showed up in the full form (2026-11-09).
 */
export function JobDraftPreview({ job, fromPoster }: JobDraftPreviewProps) {
  const t = useTranslations("ai");
  const requirements = requirementsOf(job);
  const missing = (
    <span className="italic text-muted-foreground">
      {t(fromPoster ? "jobCreator.notOnPoster" : "jobCreator.notAddedYet")}
    </span>
  );
  const moreLabel = (count: number) => t("jobCreator.more", { count });

  const location = typeof job.location === "string"
    ? job.location
    : [job.location?.city, job.location?.country].filter(Boolean).join(", ");
  const salary = job.salary && (job.salary.min || job.salary.max) ? job.salary : null;
  const range = experienceRange(job);
  const experience = range.max !== undefined
    ? t("jobCreator.experienceYears", { min: range.min ?? 0, max: range.max })
    : range.min !== undefined
      ? t("jobCreator.experienceMinOnly", { min: range.min })
      : "";
  const questionCount = job.screeningQuestions?.length ?? 0;

  return (
    <div className="space-y-2 text-xs">
      <Field label={t("jobCreator.titleLabel")}>{job.title || missing}</Field>
      <Field label={t("jobCreator.categoryLabel")}>{job.category || missing}</Field>
      <Field label={t("jobCreator.locationLabel")}>{location || missing}</Field>
      <Field label={t("jobCreator.typeLabel")}>{job.employmentType ? titleCase(job.employmentType) : missing}</Field>
      <Field label={t("jobCreator.workModeLabel")}>{job.workMode ? titleCase(job.workMode) : missing}</Field>
      <Field label={t("jobCreator.salaryLabel")}>
        {salary ? (
          job.showSalary === false
            ? t("jobCreator.notDisclosed")
            // One figure when the brief gave one ("800 a month"), not "800 – 800".
            : salary.min && salary.max && salary.min !== salary.max
              ? `${salary.currency ?? "USD"} ${formatCount(salary.min)} – ${formatCount(salary.max)}`
              : `${salary.currency ?? "USD"} ${formatCount(salary.max || salary.min)}`
        ) : (
          <span className="italic text-muted-foreground">{t("jobCreator.notSpecified")}</span>
        )}
      </Field>
      <Field label={t("jobCreator.openingsLabel")}>{job.vacancies ? formatCount(job.vacancies) : missing}</Field>
      <Field label={t("jobCreator.experienceLabel")}>{experience || missing}</Field>
      <Field label={t("jobCreator.educationLabel")}>{requirements.education?.trim() || missing}</Field>
      <div>
        <strong>{t("jobCreator.descriptionLabel")}</strong>
        {job.description?.trim() ? (
          <p className="mt-0.5 line-clamp-4 whitespace-pre-line text-muted-foreground">{job.description}</p>
        ) : (
          <p className="mt-0.5">{missing}</p>
        )}
      </div>
      <SkillChips label={t("jobCreator.requiredSkills")} items={(requirements.skills ?? []).filter(Boolean)} missing={missing} />
      <SkillChips label={t("jobCreator.preferredSkills")} items={(requirements.preferredSkills ?? []).filter(Boolean)} missing={missing} />
      <ItemList label={t("jobCreator.responsibilities")} items={job.responsibilities} missing={missing} moreLabel={moreLabel} />
      <ItemList label={t("jobCreator.qualifications")} items={job.qualifications} missing={missing} moreLabel={moreLabel} />
      <ItemList label={t("jobCreator.benefits")} items={job.benefits} missing={missing} moreLabel={moreLabel} />
      <Field label={t("jobCreator.screeningQuestionsLabel")}>
        {questionCount ? t("jobCreator.screeningCount", { count: questionCount }) : missing}
      </Field>
      {fromPoster && <p className="text-[11px] text-muted-foreground">{t("jobCreator.askChatToFix")}</p>}
    </div>
  );
}
