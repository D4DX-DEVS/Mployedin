"use client";

import { useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { PosterVariation, PosterType, PosterFormat, ShowFields } from "@/lib/composer/types";
import { FORMAT_DIMENSIONS } from "@/lib/composer/types";
import { PosterOverlay } from "./PosterOverlay";
import { buildPosterShareUrl } from "@/lib/composer/branding";
import { Download, Copy, Share2, Save } from "lucide-react";
import { toPng } from "html-to-image";
import { useMutation } from "@tanstack/react-query";

interface PosterPreviewPanelProps {
  variation: PosterVariation | null;
  job: { title?: string; companyName?: string; logo?: string; location?: { city?: string; country?: string }; salary?: { min?: number; max?: number; currency?: string }; experienceMin?: number; experienceMax?: number; skills?: string[] } | null;
  posterType: PosterType;
  showFields: ShowFields;
  formats: PosterFormat[];
  shareSlug: string | null;
  generationId: string | null;
}

export function PosterPreviewPanel({
  variation,
  job,
  posterType,
  showFields,
  formats,
  shareSlug,
  generationId,
}: PosterPreviewPanelProps) {
  const t = useTranslations("posterPreviewPanel");
  const posterRef = useRef<HTMLDivElement>(null);

  const downloadPng = useCallback(async (format: PosterFormat) => {
    if (!posterRef.current) return;
    const { width, height } = FORMAT_DIMENSIONS[format];
    const dataUrl = await toPng(posterRef.current, {
      width,
      height,
      pixelRatio: 1,
      cacheBust: true,
    });
    const link = document.createElement("a");
    link.download = `poster-${posterType}-${format}.png`;
    link.href = dataUrl;
    link.click();
  }, [posterType]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generationId) throw new Error("No generation to save");
      const res = await fetch(`/api/employers/posters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId }),
      });
      if (!res.ok) throw new Error("Failed to save poster");
      return res.json();
    },
  });

  const copyShareLink = useCallback(() => {
    if (!shareSlug) return;
    const url = buildPosterShareUrl(shareSlug);
    navigator.clipboard.writeText(url);
  }, [shareSlug]);

  if (!variation) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <p className="text-xs text-muted-foreground">
          {t("noPreview")}
        </p>
      </div>
    );
  }

  const shareUrl = shareSlug ? buildPosterShareUrl(shareSlug) : "";

  return (
    <div className="space-y-4">
      {/* Large preview */}
      <div
        ref={posterRef}
        className="relative aspect-square rounded-lg overflow-hidden border"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${variation.backgroundUrl})` }}
        />
        <PosterOverlay
          job={job}
          posterType={posterType}
          showFields={showFields}
          layout={variation.layout}
          format="instagram-post"
        />
      </div>

      {/* Download per format */}
      <div>
        <p className="text-xs font-medium text-foreground mb-2">{t("downloadShareTitle")}</p>
        <p className="text-[10px] text-muted-foreground mb-2">{t("downloadShareDesc")}</p>
        <div className="space-y-1.5">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => downloadPng(f)}
              className="w-full flex items-center justify-between rounded-lg border px-3 py-2 text-[11px] hover:bg-muted/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                {FORMAT_DIMENSIONS[f].label} ({FORMAT_DIMENSIONS[f].width}×{FORMAT_DIMENSIONS[f].height})
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                PNG <Download className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Share Link */}
      {shareSlug && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1">Share Poster</p>
          <p className="text-[10px] text-muted-foreground mb-2">Anyone with this link can view this poster</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 rounded-md border px-2 py-1.5 text-[10px] bg-muted"
            />
            <button
              type="button"
              onClick={copyShareLink}
              className="px-2 py-1.5 rounded-md border hover:bg-muted text-xs"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={copyShareLink}
              className="px-2 py-1.5 rounded-md border hover:bg-muted text-xs"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || saveMutation.isSuccess}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary/5 text-primary py-2.5 text-sm font-medium hover:bg-primary/10 disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" />
        {saveMutation.isSuccess ? t("savedState") : saveMutation.isPending ? t("savingState") : t("saveButton")}
      </button>
    </div>
  );
}
