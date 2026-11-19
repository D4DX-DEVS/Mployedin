/* ── The one place a CV becomes a PDF Blob ──
   The standardised CV (renderBuiltCv.ts: viewer download, bulk export), the CV
   a seeker sends with an application (built-cv.ts), the live preview and the
   builder's download all draw through this function, so there is a single
   render path. Client-only: react-pdf and the CV document are imported when a
   PDF is made, so importing this module does not pull the renderer into the
   caller.

   PDFs are drawn one at a time. react-pdf lays text out on font objects that
   cache per-glyph state across documents, which corrupts Arabic (see
   refreshCvPdfFonts); the fonts are parsed afresh before an Arabic document
   and before the first English one after it, and a refresh in the middle of
   another document's layout would pull the fonts out from under it. Drawing
   is CPU-bound, so queueing costs nothing a parallel export would have gained.
   A render that never finishes is cut off after CV_RENDER_TIMEOUT_MS so it
   cannot hold up everything queued behind it. */

import { createElement } from "react";
import type { CVForm, FormattingOptions } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";
import { cvHasArabic } from "@/lib/cv/scriptDirection";

/** How long one PDF may take before it is given up on. */
export const CV_RENDER_TIMEOUT_MS = 45_000;

/** A PDF took longer than CV_RENDER_TIMEOUT_MS. The next one in the queue starts regardless. */
export class CvRenderTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number = CV_RENDER_TIMEOUT_MS) {
    super(`The CV PDF was not ready after ${timeoutMs / 1000} seconds.`);
    this.name = "CvRenderTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Everything the CV document is drawn from. */
export interface CvPdfProps {
  data: CVForm;
  templateId: string;
  formatting: FormattingOptions;
  labels: CVPDFLabels;
}

// Did the PDF drawn last contain Arabic? Its glyphs are still cached on the fonts.
let lastHadArabic = false;

async function draw({ data, templateId, formatting, labels }: CvPdfProps): Promise<Blob> {
  const [{ pdf }, { CVPDFDocument }, { refreshCvPdfFonts }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/app/[locale]/(dashboard)/job-seeker/cv/cv-pdf-document"),
    import("@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared"),
  ]);
  // English text never touches the Arabic cache problem, so English PDFs in a
  // row keep their parsed fonts; fresh fonts are only worth their cost when
  // Arabic is (or just was) in play.
  const arabic = cvHasArabic({ data, labels });
  if (arabic || lastHadArabic) refreshCvPdfFonts();
  lastHadArabic = arabic;
  // CVPDFDocument returns react-pdf's <Document>; `pdf` is typed for that
  // element itself, not for a component wrapping it.
  const document = createElement(CVPDFDocument, { data, templateId, formatting, labels }) as unknown as Parameters<typeof pdf>[0];
  return pdf(document).toBlob();
}

// The tail of the queue. It never rejects: one failed PDF must not fail the next.
let queue: Promise<unknown> = Promise.resolve();

/** Rejects with CvRenderTimeoutError if `work` is still running after `ms`; a late result is ignored. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CvRenderTimeoutError(ms)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Draws the CV with react-pdf, after any PDF already being drawn. Rejects if
 * the renderer fails, or with CvRenderTimeoutError if it takes longer than
 * CV_RENDER_TIMEOUT_MS (counted from when this PDF starts, not from when it
 * was queued).
 */
export function renderCvPdfBlob(props: CvPdfProps): Promise<Blob> {
  const result = queue.then(() => withTimeout(draw(props), CV_RENDER_TIMEOUT_MS));
  queue = result.then(() => undefined, () => undefined);
  return result;
}
