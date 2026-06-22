"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

interface CvInlineFrameProps {
  /** Same-origin URL that streams the CV bytes inline (CORS-safe for fetch). */
  url: string;
  /** Accessible title for the rendered iframe. */
  title: string;
  /** Link offered by the fallback when the inline preview can't render. */
  downloadHref?: string;
}

/**
 * Renders a PDF CV inline. The CV is streamed through our own origin, whose
 * response carries X-Frame-Options: DENY / CSP frame-ancestors 'none'
 * (clickjacking protection), so the browser refuses to frame it by URL. We
 * fetch the bytes and frame an in-memory blob: URL instead, which is exempt
 * from those directives. A missing URL, a browser without a built-in PDF viewer
 * (e.g. Electron), or a failed fetch falls back to a download prompt.
 */
export function CvInlineFrame({ url, title, downloadHref }: CvInlineFrameProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    setBlobUrl(null);
    setFailed(false);

    const canViewPdf =
      typeof navigator === "undefined" ||
      (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
    if (!url || !canViewPdf) {
      setFailed(true);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    fetch(url, { credentials: "same-origin", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`CV preview failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    const timer = setTimeout(() => {
      if (!loadedRef.current) setFailed(true);
    }, 8000);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/60" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Preview isn&rsquo;t available here</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            This CV can&rsquo;t be embedded in the browser. Open or download it to view the full document.
          </p>
        </div>
        {downloadHref && (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Open / Download CV
          </a>
        )}
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      onLoad={() => {
        loadedRef.current = true;
      }}
      className="h-full w-full border-0"
      title={title}
    />
  );
}
