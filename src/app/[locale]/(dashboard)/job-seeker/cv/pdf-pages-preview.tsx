"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { CVForm, FormattingOptions } from "./types";
import type { CVPDFLabels } from "./pdf/shared";

/** Wait this long after the last edit before rebuilding the PDF. */
const DEBOUNCE_MS = 450;
/** Pixels per PDF point: sharp on a 2× screen up to ~650px wide, and in Expand. */
const RENDER_SCALE = 2.2;

interface PdfPagesPreviewProps {
  data: CVForm;
  templateId: string;
  formatting: FormattingOptions;
  labels: CVPDFLabels;
  /** Accessible name for the page images, e.g. "Page 2". */
  pageLabel: (n: number) => string;
  /** "Updating…" text shown while a new version is drawn. */
  updatingLabel: string;
  /** Shown if the PDF can't be drawn (the on-screen layout). */
  fallback: ReactNode;
}

interface RenderedPage {
  url: string;
  width: number;
  height: number;
}

/**
 * The live preview IS the downloaded PDF: the same react-pdf document is built
 * on every pause in typing and its pages are drawn with pdf.js, so page
 * breaks, fonts and spacing can never differ from the file the seeker saves.
 * The previous pages stay on screen until the new ones are ready.
 */
export function PdfPagesPreview({
  data, templateId, formatting, labels, pageLabel, updatingLabel, fallback,
}: PdfPagesPreviewProps) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const runRef = useRef(0);
  const urlsRef = useRef<string[]>([]);

  // One key for "anything that changes the PDF".
  const key = JSON.stringify([data, templateId, formatting]);

  useEffect(() => {
    const run = ++runRef.current;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const next = await renderPdfPages({ data, templateId, formatting, labels });
        if (run !== runRef.current) {
          next.forEach((p) => URL.revokeObjectURL(p.url));
          return;
        }
        urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        urlsRef.current = next.map((p) => p.url);
        setPages(next);
        setFailed(false);
      } catch (error) {
        if (run !== runRef.current) return;
        console.error("CV preview could not draw the PDF:", error);
        setFailed(true);
      } finally {
        if (run === runRef.current) setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `key` covers data, template and formatting; labels only change with the locale.
     
  }, [key, labels]);

  // Free the page images when the builder closes.
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  if (failed && pages.length === 0) return <>{fallback}</>;

  return (
    <div className="relative" aria-busy={busy}>
      {busy && pages.length > 0 && (
        <div role="status" className="sticky top-0 z-10 mb-2 flex justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[0.65rem] text-muted-foreground shadow-sm ring-1 ring-border/60">
            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            {updatingLabel}
          </span>
        </div>
      )}

      {pages.length === 0 ? (
        // First draw: a blank sheet of the right shape while the PDF is built.
        <div
          className="flex w-full items-center justify-center bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08),0_4px_12px_rgba(15,23,42,0.06)] ring-1 ring-black/5"
          style={{ aspectRatio: formatting.pageFormat === "letter" ? "8.5 / 11" : "210 / 297" }}
        >
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="sr-only">{updatingLabel}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page, i) => (
            <div key={page.url}>
              <img
                src={page.url}
                alt={pageLabel(i + 1)}
                width={page.width}
                height={page.height}
                className="block h-auto w-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08),0_4px_12px_rgba(15,23,42,0.06)] ring-1 ring-black/5"
                draggable={false}
              />
              {pages.length > 1 && (
                <p className="pt-1 text-center text-[0.65rem] text-muted-foreground" aria-hidden="true">{pageLabel(i + 1)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Drawing ── */

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js with its worker, loaded once and only when the preview first draws. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
        { type: "module" },
      );
    }
    return pdfjs;
  });
  return pdfjsPromise;
}

async function renderPdfPages({
  data, templateId, formatting, labels,
}: { data: CVForm; templateId: string; formatting: FormattingOptions; labels: CVPDFLabels }): Promise<RenderedPage[]> {
  const [{ pdf }, { CVPDFDocument }, pdfjs] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./cv-pdf-document"),
    loadPdfJs(),
  ]);
  const blob = await pdf(
    <CVPDFDocument data={data} templateId={templateId} formatting={formatting} labels={labels} />,
  ).toBlob();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  try {
    const out: RenderedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned nothing"))), "image/png"),
      );
      out.push({ url: URL.createObjectURL(png), width: canvas.width, height: canvas.height });
      page.cleanup();
    }
    return out;
  } finally {
    await doc.destroy();
  }
}
