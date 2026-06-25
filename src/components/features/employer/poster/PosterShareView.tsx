"use client";

import { buildJobApplyUrl } from "@/lib/composer/branding";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface PosterShareViewProps {
  backgroundUrl: string;
  jobTitle: string;
  companyName: string;
  jobId: string;
  slug: string;
}

export function PosterShareView({
  backgroundUrl,
  jobTitle,
  companyName,
  jobId,
  slug,
}: PosterShareViewProps) {
  const applyUrl = buildJobApplyUrl(jobId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col items-center justify-center p-4 md:p-8">
      {/* Poster image */}
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl mb-6">
        <img
          src={backgroundUrl}
          alt={`${jobTitle} - ${companyName}`}
          className="w-full h-auto"
        />
      </div>

      {/* Info + CTA */}
      <div className="text-center max-w-lg space-y-3">
        <h1 className="text-xl font-bold">{jobTitle}</h1>
        <p className="text-muted-foreground">{companyName}</p>
        <Link
          href={applyUrl}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          Apply Now <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      {/* Branding */}
      <p className="mt-8 text-xs text-muted-foreground">
        Powered by <strong>Mployedin</strong>
      </p>
    </div>
  );
}
