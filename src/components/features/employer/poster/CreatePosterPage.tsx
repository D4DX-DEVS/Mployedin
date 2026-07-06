"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import type { PosterType, PosterFormat, DesignStyle, ShowFields, PosterTemplate } from "@/lib/composer/types";

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

  // Reuse flow: /jobs/[id]/poster?generation=<id> reopens a saved poster —
  // variations, settings and editor overrides restore without a new AI call.
  const generationParam = useSearchParams().get("generation");
  const { data: savedGen } = useQuery({
    queryKey: ["poster-generation", generationParam],
    queryFn: async () => {
      const res = await fetch(`/api/employers/posters/${generationParam}`);
      if (!res.ok) throw new Error("Failed to load saved poster");
      return res.json();
    },
    enabled: Boolean(generationParam),
  });
  const hydrated = useRef(false);
  const hydrate = poster.hydrate;
  useEffect(() => {
    if (!savedGen?._id || hydrated.current) return;
    hydrated.current = true;
    // Seed the editor's autosave slot with the DB overrides (unless this browser
    // already has newer local edits for this generation).
    try {
      const key = `poster-edit:${savedGen._id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify({ look: savedGen.styleOverrides ?? {}, layout: savedGen.layoutOverride ?? null }));
      }
    } catch { /* private mode */ }
    setSelectedType(savedGen.type);
    if (savedGen.showFields) setShowFields(savedGen.showFields);
    if (savedGen.formats?.length) setFormats(savedGen.formats);
    hydrate({
      id: savedGen._id,
      variations: savedGen.variations ?? [],
      selectedIndex: savedGen.selectedVariation ?? 0,
      shareSlug: savedGen.shareSlug ?? null,
    });
  }, [savedGen, hydrate]);

  // Form state — defaults are production-smart, so "Generate now" works with zero setup.
  const [selectedType, setSelectedType] = useState<PosterType>("single-job");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<PosterTemplate>("platform-editorial");
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
      template,
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

  const rawJob = jobData?.job || jobData;
  // The job API populates the employer as job.employerId ({ companyName, logo, ... }).
  // Flatten it so the poster overlay's job.companyName / job.logo resolve to real values
  // instead of the "Company" fallback.
  const employer = rawJob?.employerId && typeof rawJob.employerId === "object" ? rawJob.employerId : null;
  const job = rawJob
    ? {
        ...rawJob,
        companyName: employer?.companyName ?? rawJob.companyName,
        logo: employer?.logo ?? rawJob.logo,
      }
    : null;
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

      {/* Generation errors were previously only rendered inside the results box,
          which stays hidden when the very first generate fails — silent failure.
          Surface them here, always. */}
      {poster.error && !poster.isGenerating && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {poster.error}
        </p>
      )}

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
            template={template}
            onTemplateChange={setTemplate}
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
