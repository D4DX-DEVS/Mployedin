"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PosterTypeSelector } from "./PosterTypeSelector";
import { PosterCustomizer } from "./PosterCustomizer";
import { PosterVariationsGrid } from "./PosterVariationsGrid";
import { PosterPreviewPanel } from "./PosterPreviewPanel";
import { CreditsBadge } from "./CreditsBadge";
import { usePosterGenerate } from "@/hooks/usePosterAI";
import { usePosterCredits } from "@/hooks/usePosterCredits";
import type { PosterType, PosterFormat, DesignStyle, ShowFields } from "@/lib/composer/types";

interface CreatePosterPageProps {
  jobId: string;
}

async function fetchJob(jobId: string) {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job");
  return res.json();
}

export function CreatePosterPage({ jobId }: CreatePosterPageProps) {
  const t = useTranslations("posterCreate");

  // Job data
  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: ["employer-job", jobId],
    queryFn: () => fetchJob(jobId),
  });

  // Poster generation state
  const poster = usePosterGenerate();
  const { credits } = usePosterCredits();

  // Form state — defaults are production-smart, so "Generate now" works with zero setup.
  const [selectedType, setSelectedType] = useState<PosterType>("single-job");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<DesignStyle>("professional");
  const [formats, setFormats] = useState<PosterFormat[]>(["instagram-post", "instagram-story", "linkedin-post", "a4-print"]);
  const [showFields, setShowFields] = useState<ShowFields>({
    salary: true,
    location: true,
    experience: true,
    skills: true,
  });

  const handleGenerate = () => {
    poster.generate({
      type: selectedType,
      formats,
      description,
      style,
      jobId,
      showFields,
    });
  };

  if (jobLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const job = jobData?.job || jobData;
  const hasResults = poster.variations.length > 0;
  const showResults = hasResults || poster.isGenerating;
  const canGenerate = (credits?.remaining ?? 0) > 0 && !poster.isGenerating;

  return (
    <div className="page-container space-y-6">
      {/* Header — primary CTA lives here so the default poster is one tap away.
          Generation spends a paid credit, so it stays an explicit button press. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2 sm:line-clamp-none">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CreditsBadge credits={credits} />
          <Button onClick={handleGenerate} disabled={!canGenerate} className="h-10 gap-2 rounded-xl px-5 font-semibold">
            {poster.isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {poster.isGenerating ? t("generating") : t("generateNow")}
          </Button>
        </div>
      </div>

      {/* Options + results. Result sections only appear once generation starts —
          empty boxes before that are noise, especially on mobile. */}
      <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${showResults ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold mb-1">{t("typeTitle")}</h2>
          <p className="text-xs text-muted-foreground mb-4">{t("typeDesc")}</p>
          <PosterTypeSelector selected={selectedType} onSelect={setSelectedType} />
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold mb-1">{t("customizeTitle")}</h2>
          <p className="text-xs text-muted-foreground mb-4">{t("customizeDesc")}</p>
          <PosterCustomizer
            job={job}
            description={description}
            onDescriptionChange={setDescription}
            style={style}
            onStyleChange={setStyle}
            showFields={showFields}
            onShowFieldsChange={setShowFields}
            formats={formats}
            onFormatsChange={setFormats}
            onGenerate={handleGenerate}
            isGenerating={poster.isGenerating}
            creditsRemaining={credits?.remaining ?? 0}
          />
        </div>

        {showResults && (
          <div className="rounded-xl border bg-card p-4 sm:p-5 order-first lg:order-none">
            <h2 className="text-base font-semibold mb-1">
              {t("resultsTitle")}{hasResults ? ` (${poster.variations.length})` : ""}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">{t("resultsDesc")}</p>
            <PosterVariationsGrid
              variations={poster.variations}
              selectedIndex={poster.selectedIndex}
              onSelect={poster.setSelectedIndex}
              onGenerateMore={poster.generateMore}
              isGeneratingMore={poster.isGeneratingMore}
              job={job}
              posterType={selectedType}
              showFields={showFields}
            />
            {poster.error && (
              <p className="text-xs text-destructive mt-2">{poster.error}</p>
            )}
          </div>
        )}

        {hasResults && (
          <div className="rounded-xl border bg-card p-4 sm:p-5 order-first lg:order-none">
            <h2 className="text-base font-semibold mb-1">{t("downloadTitle")}</h2>
            <p className="text-xs text-muted-foreground mb-4">{t("downloadDesc")}</p>
            <PosterPreviewPanel
              variation={poster.variations[poster.selectedIndex] ?? null}
              job={job}
              posterType={selectedType}
              showFields={showFields}
              formats={formats}
              shareSlug={poster.shareSlug}
              generationId={poster.generationId}
            />
          </div>
        )}
      </div>

      {/* Footer value props */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
        <ValueProp title={t("valueAiTitle")} desc={t("valueAiDesc")} />
        <ValueProp title={t("valueBrandTitle")} desc={t("valueBrandDesc")} />
        <ValueProp title={t("valueLinkTitle")} desc={t("valueLinkDesc")} />
      </div>
    </div>
  );
}

function ValueProp({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="text-center">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </div>
  );
}
