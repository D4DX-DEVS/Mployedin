"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronDown, ExternalLink, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  checkAdvert,
  checkExperienceCap,
  type WordingFinding,
} from "@/lib/compliance/inclusiveWording";
import type { JobFormValues } from "./jobFormSchema";

interface InclusiveWordingPanelProps {
  values: Partial<JobFormValues>;
}

/**
 * Advisory sidebar panel for the job wizard. Sits beside JobQualityScore and
 * mirrors its shape, so "is this a good advert?" and "is this a fair advert?"
 * read as two halves of one pre-publish review rather than a bolt-on.
 *
 * Never blocks submission — see lib/compliance/inclusiveWording for why.
 */
export function InclusiveWordingPanel({ values }: InclusiveWordingPanelProps) {
  const t = useTranslations("employerCompliance.wording");
  const tChar = useTranslations("employerCompliance.characteristics");
  const tSuggest = useTranslations("employerCompliance.suggestions");
  const [expanded, setExpanded] = useState(false);

  const { title, description, responsibilities, qualifications, benefits } = values;

  const findings: WordingFinding[] = useMemo(
    () => checkAdvert({ title, description, responsibilities, qualifications, benefits }),
    [title, description, responsibilities, qualifications, benefits]
  );

  const expMin = values.requirements?.experienceMin ?? 0;
  const expMax = values.requirements?.experienceMax ?? 0;
  const flagsExperienceCap = checkExperienceCap(expMin, expMax);

  const total = findings.length + (flagsExperienceCap ? 1 : 0);
  const clean = total === 0;

  return (
    <section
      aria-labelledby="inclusive-wording-heading"
      className="space-y-3 rounded-2xl border border-border bg-background p-3 shadow-sm sm:p-4"
    >
      <div className="min-w-0 space-y-1">
        <h2
          id="inclusive-wording-heading"
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          {clean ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          )}
          {t("title")}
        </h2>
        {/* Status is carried by the sentence itself, not only by the icon colour. */}
        <p className="text-xs leading-5 text-muted-foreground" aria-live="polite">
          {clean ? t("subtitleClean") : t("subtitleFound", { count: total })}
        </p>
      </div>

      {!clean && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="inclusive-wording-details"
            className="flex min-h-11 w-full items-center gap-1 rounded-lg text-start text-xs font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {expanded ? t("hideDetails") : t("showDetails")}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          <ul id="inclusive-wording-details" hidden={!expanded} className="space-y-2 text-xs">
            {findings.map((finding) => (
              <li
                key={`${finding.characteristic}-${finding.suggestionKey}`}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
              >
                <p className="font-semibold">
                  {tChar(finding.characteristic)}
                  <span className="ms-1.5 font-normal">
                    &mdash; <q className="font-medium">{finding.match}</q>
                  </span>
                </p>
                <p className="mt-1 leading-5">{tSuggest(finding.suggestionKey)}</p>
              </li>
            ))}
            {flagsExperienceCap && (
              <li className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
                <p className="font-semibold">{t("experienceCapTitle")}</p>
                <p className="mt-1 leading-5">{t("experienceCapBody")}</p>
              </li>
            )}
          </ul>
        </>
      )}

      <p className="border-t border-border/70 pt-2 text-xs leading-5 text-muted-foreground">
        {t("advisory")}{" "}
        <a
          href={t("guidanceHref")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("guidanceLink")}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </p>
    </section>
  );
}
