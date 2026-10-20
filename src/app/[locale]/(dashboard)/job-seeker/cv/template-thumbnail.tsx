"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import type { CVForm, FormattingOptions } from "./types";
import { getMarginPx, getPageWidthPx } from "./types";
import { cn } from "@/lib/utils";
import { TemplateRenderer } from "./templates";

/** Height ÷ width of the page sheet. A4 = 297/210, Letter = 11/8.5. */
function pageRatio(formatting: FormattingOptions): number {
  return formatting.pageFormat === "letter" ? 11 / 8.5 : 297 / 210;
}

/**
 * Shown in the gallery when the seeker has not filled in enough to show off a
 * layout. Only ever rendered in thumbnails, never in the preview or the PDF.
 */
export const SAMPLE_CV: CVForm = {
  fullName: "Sara Ahmed",
  email: "sara.ahmed@email.com",
  phone: "+971 50 123 4567",
  nationality: "",
  currentLocation: "Dubai, UAE",
  headline:
    "Full-stack developer with 5 years building fast, accessible web apps with React and Node.js. Led teams of four and shipped products used by 200k people.",
  photo: "",
  linkedin: "linkedin.com/in/sara",
  portfolio: "",
  additionalLinks: [],
  skills: ["React", "TypeScript", "Node.js", "MongoDB", "AWS", "Docker", "GraphQL", "Figma"],
  experience: [
    {
      jobTitle: "Senior Software Engineer", company: "Nimbus Labs", country: "Dubai, UAE",
      startDate: "2022-03", endDate: "", isCurrent: true,
      description: "<ul><li>Rebuilt the checkout flow, lifting conversion by 18%.</li><li>Mentored three junior engineers and set up code review.</li></ul>",
    },
    {
      jobTitle: "Software Engineer", company: "Orbit Retail", country: "Abu Dhabi, UAE",
      startDate: "2019-06", endDate: "2022-02", isCurrent: false,
      description: "<ul><li>Built REST APIs serving 2M requests a day.</li><li>Cut page load time from 4s to 1.2s.</li></ul>",
    },
  ],
  education: [
    { degree: "B.Sc. Computer Science", institution: "University of Sharjah", field: "", graduationDate: "2019-06", grade: "" },
  ],
  languages: [
    { language: "English", proficiency: "native" },
    { language: "Arabic", proficiency: "professional" },
  ],
  certifications: ["AWS Certified Developer"],
  projects: [
    { title: "Shift Planner", description: "Scheduling app for clinics with 40 active customers.", techStack: ["Next.js", "Postgres"], projectUrl: "", repoUrl: "" },
  ],
};

/** True when the seeker's own CV has enough content to make a useful thumbnail. */
export function hasThumbnailContent(data: CVForm): boolean {
  return Boolean(data.fullName.trim()) && (data.experience.length > 0 || data.education.length > 0 || Boolean(data.headline.trim()));
}

interface TemplateThumbnailProps {
  templateId: string;
  data: CVForm;
  formatting: FormattingOptions;
  /** "page": clip to the first page (gallery card). "document": the whole CV, as tall as it runs (preview dialog). */
  fit?: "page" | "document";
  /** Shadow/border chrome around the sheet. */
  className?: string;
}

/**
 * A template rendered by the same component the live preview uses, at real
 * page width, then scaled to the frame width. Purely visual: `inert` keeps the
 * CV's links out of the tab order and away from the pointer.
 */
export const TemplateThumbnail = memo(function TemplateThumbnail({
  templateId, data, formatting, fit = "page", className,
}: TemplateThumbnailProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Document mode grows with the CV, so track the unscaled sheet height too.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (fit !== "document" || !sheet) return;
    const observer = new ResizeObserver(([entry]) => setSheetHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.scrollHeight));
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [fit, frameWidth]);

  const pageWidth = getPageWidthPx(formatting);
  const pageHeight = Math.round(pageWidth * pageRatio(formatting));
  const scale = frameWidth > 0 ? frameWidth / pageWidth : 0;
  const docHeight = Math.max(pageHeight, sheetHeight);

  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      inert
      className={cn(
        "pointer-events-none relative w-full select-none overflow-hidden bg-white",
        className ?? "rounded-md border border-border shadow-sm",
      )}
      style={fit === "page" ? { aspectRatio: `${pageWidth} / ${pageHeight}` } : { height: scale > 0 ? docHeight * scale : pageHeight }}
    >
      {scale > 0 && (
        <div
          ref={sheetRef}
          className="absolute left-0 top-0 origin-top-left bg-white"
          style={{
            width: pageWidth,
            ...(fit === "page" ? { height: pageHeight } : { minHeight: pageHeight }),
            padding: getMarginPx(formatting),
            transform: `scale(${scale})`,
          }}
        >
          <TemplateRenderer templateId={templateId} data={data} formatting={formatting} />
        </div>
      )}
    </div>
  );
});
