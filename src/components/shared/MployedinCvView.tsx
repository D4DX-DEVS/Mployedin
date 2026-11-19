"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfPagesPreview } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf-pages-preview";
import { PagedPreview } from "@/app/[locale]/(dashboard)/job-seeker/cv/paged-preview";
import { TemplateRenderer } from "@/app/[locale]/(dashboard)/job-seeker/cv/templates";
import { builtCvRenderInput, renderBuiltCvPdf, type BuiltCvResponse } from "@/lib/cv/renderBuiltCv";
import { builtCvLabelLang } from "@/lib/cv/cvPdfLabels";
import { saveBlob } from "@/lib/download/saveBlob";
import { useCvPdfLabelsFor } from "./useCvPdfLabelsFor";

/**
 * The CV built on Mployedin for a seeker, drawn from their profile — the
 * "Mployedin CV" side of the CV viewer. Loaded only when that side is opened:
 * it carries the PDF renderer.
 *
 * By default it is drawn in the design the seeker saved (Classic when they
 * never chose one). `templateOverride` draws it in that template instead, in
 * the default formatting, so every candidate looks the same; the sections the
 * candidate hid stay hidden. Preview and
 * download both go through lib/cv/renderBuiltCv.ts, and both print the CV's
 * headings in the CV's own language (Arabic for an Arabic CV), not the screen's.
 */

interface MployedinCvViewProps {
  url: string;
  /** What the toolbar's Download saves the PDF as. Not needed by a caller that hides the toolbar. */
  fileName?: string;
  templateOverride?: string;
  /** Details the caller already fetched from `url`: used as they are, with no fetch of its own. */
  data?: BuiltCvResponse;
  /** The hint and Download button above the preview. A caller that draws its own turns this off. Default true. */
  showToolbar?: boolean;
}

export default function MployedinCvView({ url, fileName = "Standardised CV (Mployedin).pdf", templateOverride, data: loaded, showToolbar = true }: MployedinCvViewProps) {
  const t = useTranslations("resumeViewerModal");
  const tp = useTranslations("cvBuilderPage.preview");
  const [fetched, setFetched] = useState<BuiltCvResponse | null>(null);
  const data = loaded ?? fetched;
  const { labels, ready: labelsReady, resolve: resolveLabels } = useCvPdfLabelsFor(data ? builtCvLabelLang(data) : null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Download's failure (the PDF render threw or timed out), shown beside the button.
  const [downloadFailed, setDownloadFailed] = useState(false);

  useEffect(() => {
    if (loaded) return;
    let live = true;
    setFetched(null);
    setFailed(false);
    fetch(url, { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<BuiltCvResponse>) : Promise.reject(new Error(String(res.status)))))
      .then((body) => { if (live) setFetched(body); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [url, loaded]);

  // An old failure belongs to the CV it happened on.
  useEffect(() => { setDownloadFailed(false); }, [data]);

  const cv = useMemo(() => (data ? builtCvRenderInput(data, templateOverride) : null), [data, templateOverride]);

  async function download() {
    if (!data) return;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const blob = await renderBuiltCvPdf(data, await resolveLabels(), { templateId: templateOverride });
      saveBlob(blob, fileName);
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  }

  if (failed || (data && !data.hasContent)) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <FileText className="size-10 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium">{failed ? t("builtCvFailed") : t("builtCvEmpty")}</p>
      </div>
    );
  }
  // The preview waits for the CV's language, so its headings never flash in the screen's.
  if (!cv || !labelsReady) {
    return (
      <div className="flex min-h-full items-center justify-center" role="status" aria-label={t("builtCvLoading")}>
        <Loader2 className="size-6 animate-spin text-muted-foreground/50" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {showToolbar && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("builtCvHint")}</p>
          <Button size="sm" variant="outline" onClick={download} disabled={downloading} className="min-h-9 shrink-0 gap-1.5">
            {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
            {t("builtCvDownload")}
          </Button>
        </div>
      )}
      {showToolbar && downloadFailed && (
        <p role="alert" className="text-xs font-medium text-destructive">{t("downloadError")}</p>
      )}
      <PdfPagesPreview
        data={cv.data}
        templateId={cv.templateId}
        formatting={cv.formatting}
        labels={labels}
        pageLabel={(n) => tp("pageBreak", { n })}
        updatingLabel={tp("updating")}
        fallback={
          <PagedPreview formatting={cv.formatting} bleed={cv.templateId === "modern"} pageLabel={(n) => tp("pageBreak", { n })}>
            <TemplateRenderer templateId={cv.templateId} data={cv.data} formatting={cv.formatting} />
          </PagedPreview>
        }
      />
    </div>
  );
}
