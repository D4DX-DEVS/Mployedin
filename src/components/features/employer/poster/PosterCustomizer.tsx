"use client";

import { useTranslations } from "next-intl";
import type { PosterFormat, DesignStyle, ShowFields } from "@/lib/composer/types";
import { FORMAT_DIMENSIONS } from "@/lib/composer/types";
import { CREDITS_PER_GENERATION } from "@/lib/composer/credits";
import { CheckCircle2, Sparkles } from "lucide-react";

const DESIGN_STYLES: { id: DesignStyle; label: string }[] = [
  { id: "professional", label: "Professional" },
  { id: "modern", label: "Modern" },
  { id: "creative", label: "Creative" },
  { id: "minimal", label: "Minimal" },
  { id: "bold", label: "Bold" },
  { id: "luxury", label: "Luxury" },
];

interface PosterCustomizerProps {
  job: { title?: string; employmentType?: string; location?: { city?: string; country?: string }; salary?: { min?: number; max?: number; currency?: string }; experienceMin?: number; experienceMax?: number } | null;
  description: string;
  onDescriptionChange: (v: string) => void;
  style: DesignStyle;
  onStyleChange: (s: DesignStyle) => void;
  showFields: ShowFields;
  onShowFieldsChange: (f: ShowFields) => void;
  formats: PosterFormat[];
  onFormatsChange: (f: PosterFormat[]) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  creditsRemaining: number;
}

export function PosterCustomizer({
  job,
  description,
  onDescriptionChange,
  style,
  onStyleChange,
  showFields,
  onShowFieldsChange,
  formats,
  onFormatsChange,
  onGenerate,
  isGenerating,
  creditsRemaining,
}: PosterCustomizerProps) {
  const t = useTranslations("posterCustomizer");
  const allFormats: PosterFormat[] = ["instagram-post", "instagram-story", "linkedin-post", "a4-print"];
  const allSelected = formats.length === allFormats.length;

  const toggleFormat = (f: PosterFormat) => {
    if (formats.includes(f)) {
      if (formats.length > 1) onFormatsChange(formats.filter((x) => x !== f));
    } else {
      onFormatsChange([...formats, f]);
    }
  };

  const toggleAll = () => {
    onFormatsChange(allSelected ? [allFormats[0]] : [...allFormats]);
  };

  const locationStr = job?.location?.city
    ? `${job.location.city}, ${job.location.country || ""}`
    : job?.location?.country || "";

  const salaryStr = job?.salary?.min
    ? `${job.salary.currency || "AED"} ${job.salary.min?.toLocaleString()} - ${job.salary.max?.toLocaleString()}`
    : "";

  const expStr = job?.experienceMin != null
    ? `${job.experienceMin}-${job.experienceMax || job.experienceMin} Years Experience`
    : "";

  return (
    <div className="space-y-4">
      {/* Job info (read-only) */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{job?.title || t("jobTitle")}</p>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {job?.employmentType && <span>{job.employmentType.replace(/_/g, " ")}</span>}
          {locationStr && <><span>•</span><span>{locationStr}</span></>}
          {salaryStr && <><span>•</span><span>{salaryStr}</span></>}
          {expStr && <><span>•</span><span>{expStr}</span></>}
        </div>
      </div>

      {/* Style Description */}
      <div>
        <label className="text-xs font-medium text-foreground">{t("styleLabel")}</label>
        <p className="text-[10px] text-muted-foreground mb-1">{t("styleHelpText")}</p>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t("stylePlaceholder")}
          maxLength={300}
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-[10px] text-muted-foreground text-right">{description.length} / 300</p>
      </div>

      {/* Design Style pills */}
      <div>
        <label className="text-xs font-medium text-foreground">{t("designStyleLabel")}</label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {DESIGN_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStyleChange(s.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
                style === s.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/40"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Show on Poster toggles */}
      <div>
        <label className="text-xs font-medium text-foreground">{t("showOnPosterLabel")}</label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {(Object.keys(showFields) as (keyof ShowFields)[]).map((field) => (
            <label key={field} className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={showFields[field]}
                onChange={() => onShowFieldsChange({ ...showFields, [field]: !showFields[field] })}
                className="rounded border-input h-3.5 w-3.5 accent-primary"
              />
              <span className="capitalize">{field}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Format selector */}
      <div>
        <label className="text-xs font-medium text-foreground">{t("selectFormatLabel")}</label>
        <div className="mt-1.5 space-y-1.5">
          <button
            type="button"
            onClick={toggleAll}
            className={`w-full text-left px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
              allSelected ? "bg-primary/10 border-primary text-primary" : "border-border"
            }`}
          >
            {t("allFormats", { count: allFormats.length })}
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            {allFormats.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFormat(f)}
                className={`px-2 py-1 rounded-md border text-[10px] transition-all ${
                  formats.includes(f) ? "bg-primary/10 border-primary/50" : "border-border"
                }`}
              >
                {FORMAT_DIMENSIONS[f].label}
                <br />
                <span className="text-muted-foreground">{FORMAT_DIMENSIONS[f].width}×{FORMAT_DIMENSIONS[f].height}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 space-y-1">
        <p className="text-[11px] font-medium text-primary flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("tipsTitle")}
        </p>
        <ul className="text-[10px] text-muted-foreground space-y-0.5 pl-5 list-disc">
          <li>{t("tip1")}</li>
          <li>{t("tip2")}</li>
          <li>{t("tip3")}</li>
          <li>{t("tip4")}</li>
        </ul>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating || creditsRemaining < CREDITS_PER_GENERATION}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
      >
        <Sparkles className="h-4 w-4" />
        {isGenerating ? t("generating") : t("generatePosters", { credits: CREDITS_PER_GENERATION })}
      </button>
      <p className="text-[10px] text-center text-muted-foreground">
        {t("variationsText")}
      </p>
    </div>
  );
}
