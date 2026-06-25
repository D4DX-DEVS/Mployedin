"use client";

import type { PosterType, PosterLayout, PosterFormat, ShowFields } from "@/lib/composer/types";
import { getLayoutDefinition } from "@/lib/composer/layouts";
import { getHeadlineForType, MPLOYEDIN_LOGO_PATH } from "@/lib/composer/branding";

interface PosterOverlayProps {
  job: { title?: string; companyName?: string; logo?: string; location?: { city?: string; country?: string }; salary?: { min?: number; max?: number; currency?: string }; experienceMin?: number; experienceMax?: number; skills?: string[] } | null;
  posterType: PosterType;
  showFields: ShowFields;
  layout: PosterLayout;
  format: PosterFormat;
  compact?: boolean;
}

/**
 * Renders the text and branding overlay on top of an AI-generated background.
 * Uses the layout engine to position elements.
 * This is rendered as HTML (for html-to-image export).
 */
export function PosterOverlay({
  job,
  posterType,
  showFields,
  layout,
  format,
  compact = false,
}: PosterOverlayProps) {
  const positions = getLayoutDefinition(layout, format);
  const headline = getHeadlineForType(posterType);
  const scale = compact ? 0.6 : 1;

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
    <div className="absolute inset-0 pointer-events-none" style={{ fontSize: `${scale * 100}%` }}>
      {/* Semi-transparent overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

      {/* Employer Logo */}
      {job?.logo && (
        <div
          className="absolute"
          style={{
            left: `${positions.employerLogo.x}%`,
            top: `${positions.employerLogo.y}%`,
            width: `${positions.employerLogo.w}%`,
            height: `${positions.employerLogo.h}%`,
          }}
        >
          <img
            src={job.logo}
            alt={job.companyName || "Company"}
            className="w-full h-full object-contain rounded"
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Company Name */}
      <div
        className="absolute flex items-center"
        style={{
          left: `${positions.companyName.x}%`,
          top: `${positions.companyName.y}%`,
          width: `${positions.companyName.w}%`,
          height: `${positions.companyName.h}%`,
          textAlign: positions.companyName.align,
          color: positions.companyName.color,
          fontWeight: positions.companyName.fontWeight,
          fontSize: `${positions.companyName.fontSize * scale}px`,
        }}
      >
        <span className="truncate">{job?.companyName || "Company"}</span>
      </div>

      {/* Headline */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: `${positions.headline.x}%`,
          top: `${positions.headline.y}%`,
          width: `${positions.headline.w}%`,
          height: `${positions.headline.h}%`,
          textAlign: positions.headline.align,
          color: positions.headline.color,
          fontWeight: positions.headline.fontWeight,
          fontSize: `${positions.headline.fontSize * scale}px`,
          lineHeight: 1.1,
        }}
      >
        <span>{headline}</span>
      </div>

      {/* Job Title */}
      <div
        className="absolute flex items-center"
        style={{
          left: `${positions.jobTitle.x}%`,
          top: `${positions.jobTitle.y}%`,
          width: `${positions.jobTitle.w}%`,
          height: `${positions.jobTitle.h}%`,
          textAlign: positions.jobTitle.align,
          color: positions.jobTitle.color,
          fontWeight: positions.jobTitle.fontWeight,
          fontSize: `${positions.jobTitle.fontSize * scale}px`,
        }}
      >
        <span className="truncate">{job?.title || "Job Title"}</span>
      </div>

      {/* Details */}
      <div
        className="absolute flex flex-col gap-0.5"
        style={{
          left: `${positions.details.x}%`,
          top: `${positions.details.y}%`,
          width: `${positions.details.w}%`,
          color: positions.details.color,
          fontSize: `${positions.details.fontSize * scale}px`,
          fontWeight: positions.details.fontWeight,
        }}
      >
        {showFields.location && locationStr && <span>📍 {locationStr}</span>}
        {showFields.salary && salaryStr && <span>💰 {salaryStr}</span>}
        {showFields.experience && expStr && <span>⏰ {expStr}</span>}
        {showFields.skills && job?.skills && job.skills.length > 0 && (
          <span>🛠 {job.skills.slice(0, 4).join(", ")}</span>
        )}
      </div>

      {/* Mployedin Logo (mandatory) */}
      <div
        className="absolute flex items-center justify-end"
        style={{
          left: `${positions.mployedinLogo.x}%`,
          top: `${positions.mployedinLogo.y}%`,
          width: `${positions.mployedinLogo.w}%`,
          height: `${positions.mployedinLogo.h}%`,
        }}
      >
        <img
          src={MPLOYEDIN_LOGO_PATH}
          alt="Mployedin"
          className="h-full object-contain"
          crossOrigin="anonymous"
        />
      </div>

      {/* Apply Text (mandatory) */}
      <div
        className="absolute flex items-center"
        style={{
          left: `${positions.applyText.x}%`,
          top: `${positions.applyText.y}%`,
          width: `${positions.applyText.w}%`,
          height: `${positions.applyText.h}%`,
          textAlign: positions.applyText.align,
          color: positions.applyText.color,
          fontSize: `${positions.applyText.fontSize * scale}px`,
        }}
      >
        <span>Apply via Mployedin</span>
      </div>
    </div>
  );
}
