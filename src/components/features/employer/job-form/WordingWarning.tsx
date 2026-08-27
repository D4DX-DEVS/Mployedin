"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkAdvert } from "@/lib/compliance/inclusiveWording";

interface WordingWarningProps {
  /** Advert prose to scan. Same shape the wizard panel scans. */
  advert: {
    title?: string;
    description?: string;
    responsibilities?: string[];
    qualifications?: string[];
    benefits?: string[];
  };
  className?: string;
}

/**
 * Compact inclusive-wording warning for advert surfaces that are NOT the job
 * wizard — today the AI extraction review list, where an uploaded advert's own
 * wording is reproduced verbatim and could otherwise reach publish unchecked.
 *
 * Shares the rule set and the i18n strings with InclusiveWordingPanel; this is
 * the one-line variant that fits inside a result card. Advisory only, never
 * blocking — see lib/compliance/inclusiveWording for why.
 *
 * ponytail: no expand/collapse and no per-finding suggestion list here. The
 * card is a summary; "Edit & Post" opens the wizard, which already shows the
 * full panel with the neutral rewrites.
 */
export function WordingWarning({ advert, className }: WordingWarningProps) {
  const t = useTranslations("employerCompliance.wording");
  const tChar = useTranslations("employerCompliance.characteristics");

  const findings = useMemo(
    () =>
      checkAdvert({
        title: advert.title,
        description: advert.description,
        responsibilities: advert.responsibilities,
        qualifications: advert.qualifications,
        benefits: advert.benefits,
      }),
    [advert.title, advert.description, advert.responsibilities, advert.qualifications, advert.benefits]
  );

  if (findings.length === 0) return null;

  // One chip per characteristic, not per match — a advert repeating "young"
  // four times is one problem to the reader, not four.
  const characteristics = [...new Set(findings.map((f) => f.characteristic))];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950",
        className
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {/* Status is carried by the sentence, not only by the amber colour. */}
        <p className="text-xs font-semibold leading-5">
          {t("subtitleFound", { count: findings.length })}
        </p>
        <p className="text-xs leading-5">
          {characteristics.map((c) => tChar(c)).join(" · ")}
        </p>
      </div>
    </div>
  );
}
