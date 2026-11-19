"use client";

import { useState } from "react";
import { saveBlob } from "@/lib/download/saveBlob";
import type { BuiltCvResponse } from "@/lib/cv/renderBuiltCv";
import { builtCvLabelLang } from "@/lib/cv/cvPdfLabels";
import { useCvPdfLabelsFor } from "./useCvPdfLabelsFor";

interface StandardisedCvDownloadInput {
  /** What the download belongs to (the CV's URL): a failure is only ever shown for it. */
  scope: string;
  /** The candidate's id: the file name falls back to it when there is no name. */
  candidateId: string;
  /** The loaded details; null until they have. */
  data: BuiltCvResponse | null;
  /** Used for the file name when the profile has no name of its own. */
  fallbackName?: string;
  /** The template the PDF is drawn in; undefined = the candidate's own design. */
  templateId?: string;
}

/**
 * Download the standardised CV: made in the browser, now, by the same render
 * function as the preview and the bulk export, and saved under the export's
 * name ("{Name} - Standardised CV (Mployedin).pdf"). Nothing is stored. The
 * renderer and the naming are loaded only when Download is pressed. The CV's
 * headings are in the CV's own language, not the screen's.
 */
export function useStandardisedCvDownload({ scope, candidateId, data, fallbackName, templateId }: StandardisedCvDownloadInput) {
  const { resolve: resolveLabels } = useCvPdfLabelsFor(data ? builtCvLabelLang(data) : null);
  const [downloading, setDownloading] = useState(false);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  async function download() {
    if (!data || downloading) return;
    setDownloading(true);
    setFailedFor(null);
    try {
      const [{ renderBuiltCvPdf }, { standardisedCvFileName }] = await Promise.all([
        import("@/lib/cv/renderBuiltCv"),
        import("@/lib/cv/cvZip"),
      ]);
      const blob = await renderBuiltCvPdf(data, await resolveLabels(), { templateId });
      saveBlob(blob, standardisedCvFileName(data.identity.fullName || fallbackName || "", candidateId));
    } catch {
      setFailedFor(scope);
    } finally {
      setDownloading(false);
    }
  }

  return { download, downloading, failed: failedFor === scope };
}
