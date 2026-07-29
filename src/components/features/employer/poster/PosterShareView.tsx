"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { buildJobApplyUrl, buildQrTrackingUrl } from "@/lib/composer/branding";
import { PosterOverlay } from "./PosterOverlay";
import type { PosterType, PosterLayout, ShowFields, PosterStyleOverrides } from "@/lib/composer/types";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface PosterShareViewProps {
  backgroundUrl: string;
  /** Job snapshot for the overlay (plain JSON from the server page). */
  job: {
    title?: string; companyName?: string; logo?: string;
    location?: { city?: string; country?: string };
    salary?: { min?: number; max?: number; currency?: string };
    experienceMin?: number; experienceMax?: number; employmentType?: string;
    skills?: string[]; description?: string; responsibilities?: string[]; qualifications?: string[];
    requirements?: { skills?: string[]; education?: string } | null;
  } | null;
  posterType: PosterType;
  showFields: ShowFields;
  layout: PosterLayout;
  styleOverrides?: PosterStyleOverrides;
  jobTitle: string;
  companyName: string;
  jobId: string;
  slug: string;
}

export function PosterShareView({
  backgroundUrl,
  job,
  posterType,
  showFields,
  layout,
  styleOverrides,
  jobTitle,
  companyName,
  jobId,
  slug,
}: PosterShareViewProps) {
  const t = useTranslations("posterShareView");
  const applyUrl = buildJobApplyUrl(jobId);

  // Same QR as the editor/export: share slug → tracking redirect → apply page.
  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(buildQrTrackingUrl(slug), { margin: 1, width: 240 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [slug]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col items-center justify-center p-3 sm:p-4 md:p-8">
      {/* Composed poster: AI background + the same overlay used by editor/export */}
      <div
        className="relative w-full max-w-lg aspect-square rounded-2xl overflow-hidden shadow-2xl mb-6"
        style={{ containerType: "size" }}
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
          role="img"
          aria-label={`${jobTitle} - ${companyName}`}
        />
        <PosterOverlay
          job={job}
          posterType={posterType}
          showFields={showFields}
          layout={layout}
          format="instagram-post"
          qrDataUrl={qrDataUrl}
          style={styleOverrides}
        />
      </div>

      {/* Info + CTA */}
      <div className="text-center max-w-lg space-y-3">
        <h1 className="text-xl font-bold">{jobTitle}</h1>
        <p className="text-muted-foreground">{companyName}</p>
        <Link
          href={applyUrl}
          className="inline-flex items-center gap-2 px-3 sm:px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          {t("applyNow")} <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      {/* Branding */}
      <p className="mt-8 text-xs text-muted-foreground">
        {t("poweredBy")} <strong>Mployedin</strong>
      </p>
    </div>
  );
}
