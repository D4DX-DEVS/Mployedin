"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TemplateThumbnail } from "@/app/[locale]/(dashboard)/job-seeker/cv/template-thumbnail";
import { DEFAULT_FORMATTING } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import { EMPTY_CV_FORM, cvFormFromProfile, type SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { builderProfilePayload } from "@/lib/onboarding/builtCvFromProfile";
import type { CvBuilderResult, CvIdentity } from "./types";

interface ReviewStepProps {
  draft: CvBuilderResult;
  identity: CvIdentity;
  summaryLoading: boolean;
  onSummaryChange: (summary: string) => void;
  onRewriteSummary: () => void;
  onTemplateChange: (templateId: string) => void;
}

/** Designs offered here; the CV Builder has every other one. */
const QUICK_TEMPLATES = ["classic", "modern", "professional", "minimal"];

/**
 * The last step: the AI summary, a choice of design, and the CV itself —
 * rendered from exactly what "Save my CV" stores, through the CV Builder's
 * own template, so what they see is the CV they get.
 */
export function ReviewStep({ draft, identity, summaryLoading, onSummaryChange, onRewriteSummary, onTemplateChange }: ReviewStepProps) {
  const t = useTranslations("cvWizard.summary");
  const tt = useTranslations("cvBuilderPage.templatePicker.templates");

  const cv = useMemo(
    () =>
      cvFormFromProfile(builderProfilePayload(draft) as SeekerProfileData, {
        ...EMPTY_CV_FORM,
        fullName: identity.name,
        email: identity.email,
        phone: identity.phone,
        currentLocation: identity.location,
        photo: identity.photo,
      }),
    [draft, identity],
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="cvw-summary" className="flex flex-wrap items-center gap-2">
            {t("label")}
            {draft.summary && !summaryLoading && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                <Sparkles className="h-3 w-3" /> {t("byAi")}
              </span>
            )}
          </Label>
          <button type="button" onClick={onRewriteSummary} disabled={summaryLoading}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600 hover:underline disabled:opacity-50">
            {summaryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} {t("rewrite")}
          </button>
        </div>
        <Textarea id="cvw-summary" rows={4} maxLength={1000} value={draft.summary} onChange={(e) => onSummaryChange(e.target.value)}
          placeholder={summaryLoading ? t("writing") : t("placeholder")} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">{t("design")}</p>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_TEMPLATES.map((id) => {
            const on = (draft.templateId || "classic") === id;
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => onTemplateChange(id)}
                className={cn("relative overflow-hidden rounded-lg border-2 bg-white text-start transition-colors", on ? "border-blue-600" : "border-gray-200 hover:border-blue-300")}>
                <TemplateThumbnail templateId={id} data={cv} formatting={DEFAULT_FORMATTING} />
                <span className="flex items-center gap-1 border-t px-2 py-1 text-[11px] font-medium text-gray-700">
                  {on && <Check className="h-3 w-3 text-blue-600" />} {tt(`${id}.name`)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">{t("moreDesigns")}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("preview")}</p>
        <div className="rounded-xl border border-gray-200 bg-gray-100 p-2 sm:p-3">
          <TemplateThumbnail templateId={draft.templateId || "classic"} data={cv} formatting={DEFAULT_FORMATTING} fit="document" className="bg-white shadow-sm" />
        </div>
        <p className="text-xs text-gray-500">{t("afterHint")}</p>
      </div>
    </div>
  );
}
