"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  // Job data
  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: ["employer-job", jobId],
    queryFn: () => fetchJob(jobId),
  });

  // Poster generation state
  const poster = usePosterGenerate();
  const { credits } = usePosterCredits();

  // Form state
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

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create Job Poster</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate eye-catching posters to attract the right candidates
          </p>
        </div>
        <CreditsBadge credits={credits} />
      </div>

      {/* Stepper indicator */}
      <div className="flex items-center gap-2 text-sm">
        <Step number={1} label="Select Type" active />
        <StepArrow />
        <Step number={2} label="Customize" active={!!selectedType} />
        <StepArrow />
        <Step number={3} label="Generate" active={poster.variations.length > 0} />
        <StepArrow />
        <Step number={4} label="Download" active={poster.variations.length > 0} />
      </div>

      {/* Main 4-section grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Section 1: Choose Type */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold mb-1">1. Choose Type</h2>
          <p className="text-xs text-muted-foreground mb-4">Select a poster type</p>
          <PosterTypeSelector selected={selectedType} onSelect={setSelectedType} />
        </div>

        {/* Section 2: Customize */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold mb-1">2. Customize</h2>
          <p className="text-xs text-muted-foreground mb-4">Add details & preferences</p>
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

        {/* Section 3: AI Generated Variations */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold mb-1">3. AI Generated{poster.variations.length > 0 ? ` (${poster.variations.length} Variations)` : ""}</h2>
          <p className="text-xs text-muted-foreground mb-4">Choose your favorite or generate more</p>
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

        {/* Section 4: Preview & Download */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold mb-1">4. Preview & Download</h2>
          <p className="text-xs text-muted-foreground mb-4">Preview your poster and download</p>
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
      </div>

      {/* Footer value props */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
        <ValueProp
          title="Powered by AI"
          desc="GPT-image-1 generates unique backgrounds for your posters"
        />
        <ValueProp
          title="Brand Always On"
          desc="Mployedin branding and QR code added to every poster"
        />
        <ValueProp
          title="Drive More Applications"
          desc="Every poster links back to your job page on Mployedin"
        />
      </div>
    </div>
  );
}

function Step({ number, label, active }: { number: number; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {number}
      </div>
      <span className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function StepArrow() {
  return <span className="text-muted-foreground text-xs">→</span>;
}

function ValueProp({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="text-center">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </div>
  );
}
