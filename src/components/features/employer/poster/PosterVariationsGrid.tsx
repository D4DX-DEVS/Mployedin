"use client";

import type { PosterVariation, PosterType, ShowFields } from "@/lib/composer/types";
import { PosterOverlay } from "./PosterOverlay";
import { CREDITS_PER_MORE_VARIATIONS } from "@/lib/composer/credits";
import { Check, Image as ImageIcon, RefreshCw } from "lucide-react";

interface PosterVariationsGridProps {
  variations: PosterVariation[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onGenerateMore: () => void;
  isGeneratingMore: boolean;
  job: { title?: string; companyName?: string; location?: { city?: string; country?: string }; salary?: { min?: number; max?: number; currency?: string }; experienceMin?: number; experienceMax?: number; skills?: string[] } | null;
  posterType: PosterType;
  showFields: ShowFields;
}

export function PosterVariationsGrid({
  variations,
  selectedIndex,
  onSelect,
  onGenerateMore,
  isGeneratingMore,
  job,
  posterType,
  showFields,
}: PosterVariationsGridProps) {
  if (variations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
          <ImageIcon className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <p className="text-xs text-muted-foreground">
          Click &quot;Generate Posters&quot; to create AI variations
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Variations grid */}
      <div className="grid grid-cols-2 gap-2">
        {variations.map((variation, index) => (
          <button
            key={variation.id || index}
            type="button"
            onClick={() => onSelect(index)}
            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
              selectedIndex === index ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
            }`}
            style={{ containerType: "size" }}
          >
            {/* AI background */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${variation.backgroundUrl})` }}
            />
            {/* Overlay preview (simplified) */}
            <PosterOverlay
              job={job}
              posterType={posterType}
              showFields={showFields}
              layout={variation.layout}
              format="instagram-post"
              compact
            />
            {/* Selection indicator */}
            {selectedIndex === index && (
              <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Generate More button */}
      <button
        type="button"
        onClick={onGenerateMore}
        disabled={isGeneratingMore}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 text-primary py-2 text-xs font-medium hover:bg-primary/10 disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingMore ? "animate-spin" : ""}`} />
        {isGeneratingMore ? "Generating..." : `Generate More Variations (${CREDITS_PER_MORE_VARIATIONS} Credits)`}
      </button>

      {/* Note */}
      <p className="text-[11px] text-center text-muted-foreground">
        AI generates background designs. All text and branding are added by Mployedin.
      </p>
    </div>
  );
}
