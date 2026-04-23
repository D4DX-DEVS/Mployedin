"use client";

import { forwardRef } from "react";
import { ProfessionalTemplate } from "./poster-templates/ProfessionalTemplate";
import { CleanTemplate } from "./poster-templates/CleanTemplate";
import { SocialTemplate } from "./poster-templates/SocialTemplate";
import { BackgroundTemplate } from "./poster-templates/BackgroundTemplate";
import type { PosterTemplateItem } from "@/hooks/usePosterTemplates";

export interface PosterData {
  title: string;
  companyName: string;
  logoUrl?: string;
  tagline?: string;
  location?: string;
  salary?: string;
  workMode?: string;
  experience?: string;
  skills: string[];
  benefits: string[];
  cta?: string;
  accentColor: string;
  qrCodeSvg?: string;
  qrDataUrl?: string;
  highlights?: string[];
}

export type PosterTemplate = "professional" | "clean" | "social" | "background";
export type PosterSize = "landscape" | "square" | "story";

interface JobPosterProps {
  data: PosterData;
  template: PosterTemplate;
  size: PosterSize;
  /** Required when template === "background" */
  backgroundTemplate?: PosterTemplateItem;
  /** Override accent color for background template */
  bgAccentColor?: string;
  /** Override text theme for background template */
  bgTextTheme?: "light" | "dark" | "auto";
  /** Override font family for background template */
  bgFontFamily?: string;
  /** Font size scale for background template (0.7-1.5) */
  bgFontScale?: number;
}

export const JobPoster = forwardRef<HTMLDivElement, JobPosterProps>(
  function JobPoster({ data, template, size, backgroundTemplate, bgAccentColor, bgTextTheme, bgFontFamily, bgFontScale }, ref) {
    return (
      <div ref={ref}>
        {template === "professional" && (
          <ProfessionalTemplate data={data} size={size} />
        )}
        {template === "clean" && (
          <CleanTemplate data={data} size={size} />
        )}
        {template === "social" && (
          <SocialTemplate data={data} size={size} />
        )}
        {template === "background" && backgroundTemplate && (
          <BackgroundTemplate
            data={data}
            size={size}
            template={backgroundTemplate}
            accentColorOverride={bgAccentColor}
            textTheme={bgTextTheme}
            fontFamily={bgFontFamily}
            fontScale={bgFontScale}
          />
        )}
      </div>
    );
  },
);
